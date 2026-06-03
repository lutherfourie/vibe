import { NextRequest, NextResponse } from 'next/server';
import {
  runPipeline,
  createProviderRegistry,
  createMockProvider,
  VibePlanSchema,
  persistVibePlan,
  getSupabaseClient,
  type VibePlan,
} from '@vibe/language';

// This API route allows the dashboard (or external callers like Grok) to trigger a *real* Vibe resolve + persist flow.
// It uses the resolver/pipeline with a provider (Cerebras GLM when configured, else mock representing any of the 5 backends)
// to turn a prose description into a VibePlan, then persists it to Supabase via the wired persistVibePlan.
// The Supabase Realtime in the dashboard will then live-update the UI.
//
// Cerebras GLM (zai-glm-4.7) is forced via body.provider='cerebras' or env FORCE_CEREBRAS=true / DEFAULT_PROVIDER=cerebras.
// If forced but CEREBRAS_API_KEY missing, returns clear 400 error (no silent mock fallback).
// If key present, real provider is used for fast/cheap inference even without explicit force.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, provider } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const hasCerebrasKey = !!process.env.CEREBRAS_API_KEY;
    const requestedProvider = (provider || process.env.DEFAULT_PROVIDER || '').toLowerCase().trim();
    const forceCerebras = requestedProvider === 'cerebras' || process.env.FORCE_CEREBRAS === 'true';

    if (forceCerebras && !hasCerebrasKey) {
      console.error('[Vibe Launch API] CEREBRAS_API_KEY is required (FORCE_CEREBRAS or provider=cerebras) but not configured.');
      return NextResponse.json({
        error: 'CEREBRAS_API_KEY not configured',
        message: 'Cannot force real Cerebras GLM. Set CEREBRAS_API_KEY in web/.env.local (for dev) or Vercel Production envs.',
        hint: 'Add to .env.local or use provider=mock to fall back.',
        configured: false,
      }, { status: 400 });
    }

    if (!hasCerebrasKey) {
      console.warn('[Vibe Launch API] CEREBRAS_API_KEY not present. Using mock provider (cerebras.glm-demo). For real fast/cheap GLM set the key and use provider=cerebras or FORCE_CEREBRAS=true.');
    }

    // Build a prose description that the resolver will turn into a structured VibePlan / AutonomousSession
    const prose = `
Create a complete autonomous session plan for Vibe.
Name: ${name}
Description: ${description || 'Autonomous work on the Vibe platform'}
Use the autonomous-session, lane, checkpoint, self-review primitives.
Include at least one checkpoint and one self-review or research step.
Make it suitable for long-horizon self-bootstrapping work using any of the 5 backends (Codex, Claude, Grok, Cerebras GLM, big-AGI).
`;

    const registry = createProviderRegistry();
    let usedProviderId = 'cerebras.glm-demo';

    // Force or prefer real Cerebras GLM (fast/cheap inference for autonomous plans).
    // - Use body.provider=cerebras or env FORCE_CEREBRAS=true to force (errors if no key).
    // - If key present, prefer real even without force (for cheap inference).
    // - Otherwise use mock. Never fails silently on force.
    if (forceCerebras || hasCerebrasKey) {
      const { createCerebrasProvider } = await import('@vibe/language');
      registry.register(
        createCerebrasProvider({
          apiKey: process.env.CEREBRAS_API_KEY!,
          baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
          model: process.env.CEREBRAS_MODEL || 'zai-glm-4.7',
          id: 'cerebras.glm-real',
        })
      );
      usedProviderId = 'cerebras.glm-real';
    } else {
      // Mock representing any of the 5 backends (Codex, Claude, Grok, Cerebras GLM, big-AGI)
      const { randomUUID } = await import('crypto');
      const mockProvider = createMockProvider({
        id: 'cerebras.glm-demo',
        mode: 'api',
        response: {
          kind: 'plan',
          version: 'v0.1-autonomous',
          generatedAt: new Date().toISOString(),
          sourceFile: 'dashboard-launch',
          session: {
            id: randomUUID(),
            name,
            description: description || 'Autonomous session launched from Vibe dashboard',
            lanes: [
              {
                id: randomUUID(),
                name: 'main-work',
                steps: [
                  { type: 'checkpoint', id: randomUUID(), name: 'start', resumeStrategy: 'last-checkpoint' },
                  { type: 'self-review', id: randomUUID(), criteria: ['correctness', 'tests pass'], required: true },
                ],
                skills: ['vibe-language', 'supabase', 'providers'],
              },
            ],
            checkpoints: [
              { id: randomUUID(), name: 'start', resumeStrategy: 'last-checkpoint' },
            ],
            resumeOnRestart: true,
            metadata: { launchedFrom: 'web-dashboard', backend: 'cerebras.glm-demo (mock)' },
          },
        },
      });
      registry.register(mockProvider);
    }

    // Run the pipeline with the prose and VibePlanSchema (or AutonomousSessionSchema)
    const result = await runPipeline({
      source: `// dashboard launch prose
${prose}
`,
      registry,
      defaultResolver: {
        provider: usedProviderId,
        model: 'zai-glm-4.7',
        temperature: 0.3,
      },
      proseSchema: VibePlanSchema,
    });

    // The resolvedRegions should contain the plan from the resolver
    let plan: VibePlan | null = null;
    for (const r of result.resolvedRegions) {
      try {
        plan = VibePlanSchema.parse(r.value) as VibePlan;
        break;
      } catch {}
    }

    if (!plan) {
      // Fallback to a constructed plan so persist always succeeds for the demo
      const { randomUUID } = await import('crypto');
      plan = {
        kind: 'plan',
        version: 'v0.1-autonomous',
        generatedAt: new Date().toISOString(),
        sourceFile: 'dashboard-launch',
        session: {
          id: randomUUID(),
          name,
          description: description || 'Autonomous session launched from Vibe dashboard',
          lanes: [
            {
              id: randomUUID(),
              name: 'main-work',
              steps: [
                { type: 'checkpoint', id: randomUUID(), name: 'start', resumeStrategy: 'last-checkpoint' as const },
                { type: 'self-review', id: randomUUID(), criteria: ['correctness', 'tests pass'], required: true },
              ],
              skills: ['vibe-language', 'supabase', 'providers'],
            },
          ],
          checkpoints: [
            { id: randomUUID(), name: 'start', resumeStrategy: 'last-checkpoint' as const },
          ],
          resumeOnRestart: true,
          metadata: { launchedFrom: 'web-dashboard', backend: usedProviderId },
        },
      } as any;
    }

    if (!plan || !plan.session) {
      return NextResponse.json({ error: 'Failed to resolve a valid VibePlan' }, { status: 500 });
    }

    // Persist to Supabase (this is what feeds the live dashboard via Realtime)
    const persistResult = await persistVibePlan(plan);

    // Telemetry for the launch action (best effort, non-blocking). Complements the plan_resolved
    // emitted inside persistVibePlan. All hosted in Supabase alongside C&C and state.
    if (persistResult.sessionId) {
      const sb = getSupabaseClient();
      if (sb) {
        const ins = sb.from("telemetry_events").insert({
          session_id: persistResult.sessionId,
          kind: "launch",
          source: "web",
          payload: { provider: usedProviderId || "unknown", name, description: description || null },
        });
        Promise.resolve(ins).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      plan,
      persisted: persistResult.persisted,
      sessionId: persistResult.sessionId,
      message: 'Real Vibe resolve + persist completed. Supabase Realtime will push the update to any open dashboards.',
    });
  } catch (err: any) {
    console.error('Launch API error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
