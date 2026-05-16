#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE = "examples/vibe-self.vibe";

export function readVibeSelfPlan(source, options = {}) {
  const cleanSource = stripLineComments(source);
  const declarations = readDeclarations(cleanSource);
  const plugins = declarations.filter((declaration) => declaration.kind === "plugin");
  const memory = declarations.find((declaration) => declaration.kind === "memory");

  const lanes = plugins
    .filter((plugin) => plugin.name.endsWith("_lane"))
    .map(readLane);
  const gates = plugins
    .filter((plugin) => plugin.name.endsWith("_gate"))
    .map(readGate);

  return {
    name: options.name ?? "vibe-self",
    source: options.source ?? DEFAULT_SOURCE,
    repo: stringValue(memory?.fields.namespace),
    routes: readRoutes(cleanSource),
    fallback: readFallback(cleanSource),
    providers: declarations
      .filter((declaration) => declaration.kind === "provider")
      .map(readNamedMetadata),
    surfaces: declarations
      .filter((declaration) => declaration.kind === "surface")
      .map(readSurface),
    agents: declarations
      .filter((declaration) => declaration.kind === "agent")
      .map(readAgent),
    lanes,
    gates,
    nextWorkChecklist: lanes.map(readNextWork),
    notes: [
      "Standalone reader for the current self-plan source; it is intentionally tolerant and provisional.",
      "Plugins ending in _lane are treated as lanes until lane syntax exists.",
      "Plugins ending in _gate are treated as gates until gate syntax exists.",
    ],
  };
}

function readNamedMetadata(declaration) {
  return {
    name: declaration.name,
    metadata: declaration.fields,
  };
}

function readSurface(declaration) {
  return {
    name: declaration.name,
    kind: stringValue(declaration.fields.kind),
    mode: stringValue(declaration.fields.mode),
    metadata: declaration.fields,
  };
}

function readAgent(declaration) {
  return {
    name: declaration.name,
    persona: stringValue(declaration.fields.persona),
    memory: stringValue(declaration.fields.memory),
    harness: stringValue(declaration.fields.harness),
    uses: stringListValue(declaration.fields.uses) ?? [],
    metadata: declaration.fields,
  };
}

function readLane(declaration) {
  const fields = declaration.fields;
  return {
    name: declaration.name,
    impl: stringValue(fields.impl),
    owns: stringValue(fields.owns),
    emits: stringValue(fields.emits),
    target: stringValue(fields.target),
    reads: stringListValue(fields.reads),
    verify: stringListValue(fields.verify),
    approval: stringValue(fields.approval),
    metadata: fields,
  };
}

function readGate(declaration) {
  const fields = declaration.fields;
  return {
    name: declaration.name,
    impl: stringValue(fields.impl),
    owns: stringValue(fields.owns),
    emits: stringValue(fields.emits),
    metadata: fields,
  };
}

function readNextWork(lane) {
  const checklist = [];
  if (lane.reads?.length) {
    checklist.push(`Read ${lane.reads.join(", ")}.`);
  }
  if (lane.owns) {
    checklist.push(`Own ${lane.owns}.`);
  }
  if (lane.emits) {
    checklist.push(`Emit ${lane.emits}.`);
  }
  if (lane.verify?.length) {
    checklist.push(`Verify with ${lane.verify.join("; ")}.`);
  }
  if (lane.approval) {
    checklist.push(`Pause for ${lane.approval}.`);
  }

  return {
    lane: lane.name,
    target: lane.target,
    reads: lane.reads,
    owns: lane.owns,
    verify: lane.verify,
    approval: lane.approval,
    checklist,
  };
}

function readRoutes(source) {
  const routes = {};
  const routePattern = /^\s*route\s+([A-Za-z0-9_.-]+)\s*->\s*([A-Za-z0-9_.-]+)/gm;
  for (const match of source.matchAll(routePattern)) {
    routes[match[1]] = match[2];
  }
  return routes;
}

function readFallback(source) {
  const fallback = /^\s*fallback\s*->\s*([A-Za-z0-9_.-]+)/m.exec(source);
  return fallback?.[1];
}

function readDeclarations(source) {
  const declarations = [];
  const declarationPattern =
    /\b(provider|surface|persona|memory|harness|plugin|agent)\s+([A-Za-z0-9_.-]+)\s*\{/g;

  for (const match of source.matchAll(declarationPattern)) {
    const openBrace = match.index + match[0].lastIndexOf("{");
    const closeBrace = findMatchingBrace(source, openBrace);
    if (closeBrace < 0) {
      throw new Error(`Unclosed ${match[1]} declaration: ${match[2]}`);
    }

    declarations.push({
      kind: match[1],
      name: match[2],
      fields: readFields(source.slice(openBrace + 1, closeBrace)),
    });
  }

  return declarations;
}

function readFields(body) {
  const fields = {};
  const fieldPattern =
    /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(\[[\s\S]*?\]|"(?:(?:\\.)|[^"])*"|[^\r\n]+)/gm;

  for (const match of body.matchAll(fieldPattern)) {
    fields[match[1]] = readValue(match[2]);
  }

  return fields;
}

function readValue(rawValue) {
  const value = rawValue.trim().replace(/,$/, "").trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitArrayItems(value.slice(1, -1)).map(readValue);
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitArrayItems(value) {
  const items = [];
  let current = "";
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (inString && char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      current += char;
      inString = !inString;
      continue;
    }
    if (!inString && (char === "," || char === "\n" || char === "\r")) {
      pushCurrent();
      continue;
    }
    current += char;
  }

  pushCurrent();
  return items;

  function pushCurrent() {
    const item = current.trim();
    if (item) items.push(item);
    current = "";
  }
}

function findMatchingBrace(source, openBrace) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openBrace; index < source.length; index++) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function stripLineComments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      let inString = false;
      let escaped = false;
      for (let index = 0; index < line.length - 1; index++) {
        const char = line[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (inString && char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString && char === "/" && line[index + 1] === "/") {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n");
}

function stringValue(value) {
  return typeof value === "string" ? value : undefined;
}

function stringListValue(value) {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === "string")) return undefined;
  return value;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const sourcePath = resolve(args.source);
  const source = await readFile(sourcePath, "utf8");
  const plan = readVibeSelfPlan(source, {
    source: toPortablePath(args.source),
    name: args.name,
  });
  const json = `${JSON.stringify(plan, null, 2)}\n`;

  if (args.out) {
    const outPath = resolve(args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf8");
    console.log(outPath);
    return;
  }

  process.stdout.write(json);
}

function readArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    out: undefined,
    name: undefined,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--source") {
      args.source = requiredValue(argv, ++index, "--source");
    } else if (arg === "--out") {
      args.out = requiredValue(argv, ++index, "--out");
    } else if (arg === "--name") {
      args.name = requiredValue(argv, ++index, "--name");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function toPortablePath(path) {
  return path.replaceAll("\\", "/");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`read-vibe-self: ${message}`);
    process.exit(1);
  });
}
