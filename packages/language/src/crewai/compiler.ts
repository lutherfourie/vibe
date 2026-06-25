import { parseVibeSource } from '../self/parse.js';
import { extractSelfPlan, type VibeSelfPlan } from '../self/self-plan.js';
import {
  isAutonomousSession,
  isLane,
  isListExpression,
  isPersona,
  isPlugin,
  isProvider,
  isRoute,
  isStringLiteral,
  isSurface,
  type Expression,
  type Field,
  type Persona,
  type Plugin,
  type Project,
} from '../generated/ast.js';
import type { CrewAICompileOptions, CrewAICompileResult } from './types.js';

function humanizeName(name: string): string {
  return name
    .split(/[._-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function sanitizePyName(name: string): string {
  let s = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(s)) s = '_' + s;
  return s || 'item';
}

function expressionValue(expr: Expression | undefined): unknown {
  if (!expr) return undefined;
  if (isStringLiteral(expr)) return expr.value;
  // minimal: only string literals needed for our derivations; others fall through
  if ((expr as any).value !== undefined) return (expr as any).value;
  return undefined;
}

function stringValue(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function stringListValue(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

function scopesOverlap(a: string[], b: string[]): boolean {
  for (const wa of a) {
    for (const wb of b) {
      if (!wa || !wb) continue;
      const na = wa.replace(/\/\*\*$/, '').replace(/\/$/, '');
      const nb = wb.replace(/\/\*\*$/, '').replace(/\/$/, '');
      if (na === nb || na.startsWith(nb + '/') || nb.startsWith(na + '/')) return true;
    }
  }
  return false;
}

function readMetadataForAny(source: { fields: Field[] }): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const field of source.fields) {
    metadata[field.name] = expressionValue(field.value);
  }
  return metadata;
}

function buildVibeHeader(
  surface: string,
  plan: VibeSelfPlan,
  personaNames: string[],
  laneNames: string[]
): string {
  const reads = Array.from(new Set(plan.lanes.flatMap((l) => l.reads ?? [])));
  const verifies = Array.from(new Set(plan.lanes.flatMap((l) => l.verify ?? [])));
  const approvals = Array.from(
    new Set([
      ...plan.lanes.map((l) => l.approval).filter(Boolean) as string[],
      ...plan.gates.map((g) => g.name),
    ])
  );
  const lines: string[] = [
    '# Vibe IaC header',
    `# surface: ${surface}`,
    `# personas: ${personaNames.join(', ')}`,
    `# lanes: ${laneNames.join(', ')}`,
    `# scope (declared reads): ${reads.length ? reads.join(' ; ') : '(none declared)'}`,
    `# scope (declared writes/owns): see lane owns`,
    `# verify commands: ${verifies.length ? verifies.join(' ; ') : '(none declared)'}`,
    `# approval gates: ${approvals.length ? approvals.join(', ') : '(none)'}`,
    '# Vibe IaC contract — see docs/VIBE-CREWAI-BUILD-PROGRESS.md',
  ];
  return lines.join('\n') + '\n';
}

function buildLlmBlock(plan: VibeSelfPlan): string {
  if (plan.providers.length === 0) return '';
  const p = plan.providers[0];
  if (!p) return '';
  const model = stringValue(p.metadata.model) ?? p.model ?? 'gpt-4o';
  return [
    '',
    `# Derived from provider ${p.name} + routes`,
    `# llm = LLM(model="${model}")`,
    '# api_key from env (Vibe never emits secrets)',
    '',
  ].join('\n');
}

function buildAgentsBlock(
  project: Project,
  plan: VibeSelfPlan,
  diagnostics: string[]
): { agentsBlock: string; pyAgentNames: string[]; personaNames: string[] } {
  const personaDecls = project.declarations.filter(isPersona) as Persona[];
  const personaNames: string[] = [];
  let agentsBlock = '';
  const pyAgentNames: string[] = [];

  if (personaDecls.length === 0) {
    diagnostics.push('no personas found');
    const varName = 'orchestrator';
    pyAgentNames.push(varName);
    personaNames.push('orchestrator');
    agentsBlock = `
orchestrator = Agent(
    role="Orchestrator",
    goal="Fulfil the orchestrator persona within the Vibe IaC contract",
    backstory="Default Vibe IaC orchestrator."
)
`;
  } else {
    for (const pers of personaDecls) {
      const meta = readMetadataForAny(pers);
      const description = stringValue(meta.description) ?? 'Vibe persona participating in IaC flow.';
      const role = humanizeName(pers.name);
      const goal = stringValue(meta.goal) ?? `Fulfil the ${role} persona within the Vibe IaC contract`;
      const backstory = description;
      const varName = sanitizePyName(pers.name);
      pyAgentNames.push(varName);
      personaNames.push(pers.name);
      agentsBlock += `
${varName} = Agent(
    role="${role}",
    goal="${goal}",
    backstory="${backstory}"
)
`;
    }
  }
  return { agentsBlock, pyAgentNames, personaNames };
}

function buildTasksBlock(
  plan: VibeSelfPlan,
  pyAgentNames: string[],
  humanLanes: Set<string>
): { tasksBlock: string; taskNames: string[] } {
  let tasksBlock = '';
  const taskNames: string[] = [];
  const agentRef = pyAgentNames[0] || 'orchestrator';
  const lanes = plan.lanes.length > 0 ? plan.lanes : [{ name: 'default', target: undefined, approval: undefined } as any];
  for (const lane of lanes) {
    const tname = sanitizePyName(lane.name) + '_task';
    taskNames.push(tname);
    const targetInfo = lane.target ? ` (target=${lane.target})` : '';
    const isHuman = humanLanes.has(lane.name);
    const humanSuffix = isHuman ? ',\n    human_input=True' : '';
    tasksBlock += `
${tname} = Task(
    description="Execute Vibe lane ${lane.name}${targetInfo}. Follow declared reads, verify, and gates.",
    expected_output="Lane ${lane.name} completed per Vibe contract and PROGRESS.md",
    agent=${agentRef}${humanSuffix}
)
`;
  }
  return { tasksBlock, taskNames };
}

function buildHumanGateComment(hasHuman: boolean): string {
  if (!hasHuman) return '';
  return `
# Vibe gate comment block (real HITL; no fake stub)
# VIBE_GATE: human approval required (see PROGRESS.md)
#   Crew/Task: Task(..., human_input=True)
#   Flow: @human_feedback(message=...) from crewai.flow.human_feedback
`;
}

function buildCrewBlock(
  pyAgentNames: string[],
  taskNames: string[]
): string {
  const agentsList = pyAgentNames.length ? pyAgentNames.join(', ') : 'orchestrator';
  const tasksList = taskNames.length ? taskNames.join(', ') : '';
  return `
crew = Crew(
    agents=[${agentsList}],
    tasks=[${tasksList}],
    verbose=True
)
# Fallback sequential execution for CrewAI surface (Flow preferred when lanes present)
# result = crew.kickoff()
`;
}

function buildFlowPy(plan: VibeSelfPlan, hasHumanLanes: Set<string>): string {
  if (plan.lanes.length === 0 && plan.autonomousSessions.length === 0) {
    return '';
  }
  const laneSources =
    plan.lanes.length > 0
      ? plan.lanes.map((l) => l.name)
      : plan.autonomousSessions.flatMap((s) =>
          Array.from({ length: s.laneCount || 1 }, (_, i) => `${s.name}_lane${i + 1}`)
        );
  let methods = '';
  let first = true;
  let prevMethod = '';
  const anyHuman = hasHumanLanes.size > 0;
  for (const ln of laneSources) {
    const safe = sanitizePyName(ln);
    const decorator = first ? '@start()' : `@listen(${prevMethod})`;
    const decorators: string[] = [`    ${decorator}`];
    if (hasHumanLanes.has(ln)) {
      decorators.push(`    @human_feedback(message="Vibe gate: human approval required for lane ${ln} (see PROGRESS.md)")`);
    }
    const decoBlock = decorators.join('\n');
    methods += `
${decoBlock}
    def ${safe}(self${first ? '' : ', _prev'}):
        # VIBE_CHECKPOINT: ${ln}
        # Vibe lane step (driven from self-plan lanes/autonomousSessions)
        print("Vibe Flow step: ${ln}")
        return {"lane": "${ln}", "status": "done"}
`;
    first = false;
    prevMethod = safe;
  }
  let imports = 'from crewai.flow.flow import Flow, start, listen';
  if (anyHuman) {
    imports += '\nfrom crewai.flow.human_feedback import human_feedback';
  }
  return `${imports}

class VibeCrewFlow(Flow):
${methods}
# Flow entry: VibeCrewFlow().kickoff()
`;
}

function buildToolsPy(project: Project, plan: VibeSelfPlan): string | undefined {
  const plugins = project.declarations.filter(isPlugin) as Plugin[];
  const toolPlugins = plugins.filter((p) => {
    if (p.name.endsWith('_lane') || p.name.endsWith('_gate')) return false;
    const meta = readMetadataForAny(p);
    const target = stringValue(meta.target) ?? '';
    if (target.includes('crewai')) return true;
    // tool-shaped if has impl and not lane/gate (conservative: only explicit crewai targets for P1)
    return false;
  });
  if (toolPlugins.length === 0) return undefined;

  let code = '# tools.py — Vibe-generated CrewAI tool stubs\n';
  code += 'from crewai import tool\n\n';
  for (const pl of toolPlugins) {
    const meta = readMetadataForAny(pl);
    const impl = stringValue(meta.impl) ?? 'mcp-or-impl';
    const fname = sanitizePyName(pl.name) + '_tool';
    code += `
@tool
def ${fname}(query: str = "") -> str:
    """${pl.name} tool stub.
    # MCP/impl: ${impl}
    """
    return f"stub:{pl.name}:{query}"
`;
  }
  return code;
}

function hasHumanApproval(laneOrGate: { approval?: string; name?: string }): boolean {
  if (laneOrGate.approval && String(laneOrGate.approval).startsWith('human')) return true;
  if (laneOrGate.name && laneOrGate.name.endsWith('_gate')) return true;
  return false;
}

export function compileCrewAI(
  project: Project,
  options: CrewAICompileOptions = {}
): CrewAICompileResult {
  const plan: VibeSelfPlan = extractSelfPlan(project, { sourceName: 'compile-crewai' });
  const diagnostics: string[] = [];

  // Surface selection (honor options.surface)
  let surface = options.surface;
  const crewSurf = plan.surfaces.find((s) => s.name === 'crewai.local' || s.name.includes('crewai'));
  if (!surface) {
    surface = crewSurf ? crewSurf.name : 'crewai.local';
  }
  if (!plan.surfaces.some((s) => s.name === surface)) {
    diagnostics.push(`no ${surface} surface — defaulting`);
  }

  // Personas + agents
  const { agentsBlock, pyAgentNames, personaNames } = buildAgentsBlock(project, plan, diagnostics);

  // Lanes for flow/tasks (filter by laneName if provided for focus)
  let activeLanes = plan.lanes;
  if (options.laneName) {
    activeLanes = activeLanes.filter((l) => l.name === options.laneName);
    if (activeLanes.length === 0) {
      diagnostics.push(`laneName ${options.laneName} not matched — using all`);
      activeLanes = plan.lanes;
    }
  }

  const laneNames = activeLanes.map((l) => l.name);
  const humanLanes = new Set(activeLanes.filter(hasHumanApproval).map((l) => l.name));
  const humanGatesFromPlan = plan.gates.filter((g) => g.name.endsWith('_gate')).map((g) => g.name);
  const hasAnyHuman = humanLanes.size > 0 || humanGatesFromPlan.length > 0 || plan.gates.length > 0;

  // (b) HARDEN diagnostics (P5)
  // unknown provider referenced by route for crewai use
  for (const [from, to] of Object.entries(plan.routes)) {
    const prov = String(to || '');
    if (prov && !plan.providers.some((p) => p.name === prov)) {
      diagnostics.push(`unknown provider referenced by crewai route/agent: ${from} -> ${prov}`);
    }
  }
  // persona missing a goal (CrewAI Agent requires role+goal)
  const personaDeclsForDiag = project.declarations.filter(isPersona) as Persona[];
  for (const pers of personaDeclsForDiag) {
    const meta = readMetadataForAny(pers);
    if (!stringValue(meta.goal)) {
      diagnostics.push(`persona ${pers.name} is missing a goal (CrewAI Agent requires role+goal)`);
    }
  }
  // overlapping write scopes across lanes (owns or metadata.writes)
  const laneWriteScopes = activeLanes.map((l) => ({
    name: l.name,
    writes: (l.owns ? [l.owns] : []).concat(stringListValue((l.metadata as any)['writes'])),
  }));
  for (let i = 0; i < laneWriteScopes.length; i++) {
    const left = laneWriteScopes[i]!;
    for (let j = i + 1; j < laneWriteScopes.length; j++) {
      const right = laneWriteScopes[j]!;
      if (scopesOverlap(left.writes, right.writes)) {
        diagnostics.push(
          `overlapping write scopes across lanes: ${left.name} and ${right.name}`
        );
      }
    }
  }

  const gateCount =
    plan.gates.length + activeLanes.filter((l) => hasHumanApproval(l)).length;

  // Tools (only explicit non-lane crewai-targeting plugins)
  const toolsPy = buildToolsPy(project, plan);
  const toolCount = toolsPy ? (toolsPy.match(/def \w+_tool/g) || []).length : 0;

  // Header (common)
  const vibeHeader = buildVibeHeader(surface!, plan, personaNames, laneNames);

  // LLM
  const llmBlock = buildLlmBlock(plan);

  // Tasks + crew fallback in crewPy
  const { tasksBlock, taskNames } = buildTasksBlock(
    { ...plan, lanes: activeLanes },
    pyAgentNames,
    humanLanes
  );
  const humanComment = buildHumanGateComment(hasAnyHuman);
  const crewBlock = buildCrewBlock(pyAgentNames, taskNames);

  // Start with required import line (Flow import handled in buildFlowPy with correct human_feedback when needed)
  const crewPy =
    'from crewai import Agent, Task, Crew\n' +
    '\n' +
    vibeHeader +
    llmBlock +
    agentsBlock +
    tasksBlock +
    humanComment +
    crewBlock;

  // Flow (preferred for lanes/autonomous)
  const flowPy = buildFlowPy({ ...plan, lanes: activeLanes }, humanLanes);

  // Manifest (deterministic, no timestamps)
  const manifest: Record<string, unknown> = {
    surface,
    personas: personaNames,
    laneCount: (plan.lanes.length || 0) + plan.autonomousSessions.reduce((acc, s) => acc + (s.laneCount || 0), 0),
    toolCount,
    gateCount,
    crewai: { pinned: 'crewai==1.14.7' },
  };

  // vibeContractMd mirrors header contract info
  const vibeContractMd =
    '# Vibe IaC Contract (CrewAI)\n\n' +
    vibeHeader +
    '\nVibe IaC contract — see docs/VIBE-CREWAI-BUILD-PROGRESS.md\n';

  return {
    crewPy,
    toolsPy,
    flowPy: flowPy || undefined,
    manifest,
    vibeContractMd,
    diagnostics,
    requirements: 'crewai==1.14.7\n',
  };
}

export async function compileCrewAIFromSource(
  source: string,
  options: CrewAICompileOptions = {}
): Promise<CrewAICompileResult> {
  const parsed = await parseVibeSource(source, { validate: true });
  const result = compileCrewAI(parsed.project, options);
  if (parsed.errors.length > 0) {
    result.diagnostics.push(...parsed.errors.map((e) => `parse: ${e}`));
  }
  return result;
}
