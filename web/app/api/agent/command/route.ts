import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This API route lets external operators (Grok in this chat, Claude, Codex, other agents)
// send remote commands to autonomous Vibe sessions/agents via Supabase as the C&C plane.
// The Go autonomous runner(s) poll or listen and act on 'pending' commands.
// Easy to call: POST /api/agent/command with JSON { session_id, command, payload?, issued_by? }
// Uses service key server-side for writes (never expose service to client).

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, command, payload = {}, issued_by = 'grok' } = body;

    if (!session_id || !command) {
      return NextResponse.json({ error: 'session_id and command are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('agent_commands')
      .insert({
        session_id,
        command,
        payload,
        issued_by,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('agent command insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also emit an event for monitoring (realtime will push to dashboards)
    await supabase.from('agent_events').insert({
      session_id,
      command_id: data.id,
      kind: 'command_received',
      payload: { command, issued_by },
    });

    return NextResponse.json({
      success: true,
      command: data,
      message: 'Command queued in Supabase. Autonomous runner will process it.',
    });
  } catch (err: any) {
    console.error('agent/command error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Convenience: list recent commands for a session (?session_id=xxx&status=pending)
  const { searchParams } = new URL(request.url);
  const sessionID = searchParams.get('session_id');
  const status = searchParams.get('status') || 'pending';

  let query = supabase.from('agent_commands').select('*').order('created_at', { ascending: false }).limit(50);
  if (sessionID) query = query.eq('session_id', sessionID);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ commands: data });
}
