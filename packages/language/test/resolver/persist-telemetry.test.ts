import { describe, expect, it } from "vitest";
import { buildPersistTelemetryRows } from "../../src/resolver/persist.js";
import type { VibePlan } from "../../src/resolver/schemas.js";

describe("persist telemetry rows", () => {
  it("builds resolver telemetry for the persisted session and plan details", () => {
    const plan: VibePlan = {
      kind: "plan",
      version: "v0.1-autonomous",
      generatedAt: "2026-06-03T12:00:00.000Z",
      sourceFile: "dashboard-launch",
      session: {
        id: "session-1",
        name: "self-build",
        description: "Improve autonomous telemetry",
        lanes: [
          {
            id: "lane-1",
            name: "main-work",
            steps: [],
            skills: ["telemetry"],
          },
        ],
        checkpoints: [
          {
            id: "checkpoint-1",
            name: "start",
            resumeStrategy: "last-checkpoint",
          },
        ],
        resumeOnRestart: true,
        metadata: { backend: "cerebras.glm-real" },
      },
    };

    const rows = buildPersistTelemetryRows(plan, "session-1");

    expect(rows.map((row) => row.kind)).toEqual([
      "plan_resolved",
      "session_persisted",
      "lane_persisted",
      "checkpoint_persisted",
      "provider_used",
    ]);
    expect(rows[0]).toMatchObject({
      session_id: "session-1",
      source: "resolver",
      payload: {
        version: "v0.1-autonomous",
        sourceFile: "dashboard-launch",
        generatedAt: "2026-06-03T12:00:00.000Z",
      },
    });
    expect(rows[4]).toMatchObject({
      kind: "provider_used",
      payload: { provider: "cerebras.glm-real" },
    });
  });
});
