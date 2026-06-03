import { NextResponse } from 'next/server';

/**
 * No-op stub to silence 404 noise from external "cockpit" clients/extensions.
 *
 * This path is referenced in historical docs (separate Cockpit project + VS Code harness)
 * and by other tools in the user's environment (unrelated to the Vibe autonomous
 * dashboard at / + /api/launch).
 *
 * Our credential setup + Supabase realtime work for the autonomous dashboard
 * does not use or depend on this route.
 */
export async function GET() {
  // Return empty config; real cockpit (if/when wired) can expand this later.
  return NextResponse.json({});
}
