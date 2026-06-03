import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Simple status + recent events/responses for a session. Grok/Claude can poll or use to monitor.
// GET /api/agent/status?session_id=xxx

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionID = searchParams.get('session_id');
  if (!sessionID) {
    return NextResponse.json({ error: 'session_id query param required' }, { status: 400 });
  }

  const [cmds, events, responses] = await Promise.all([
    supabase.from('agent_commands').select('*').eq('session_id', sessionID).order('created_at', { ascending: false }).limit(20),
    supabase.from('agent_events').select('*').eq('session_id', sessionID).order('created_at', { ascending: false }).limit(30),
    supabase.from('agent_responses').select('*').eq('session_id', sessionID).order('created_at', { ascending: false }).limit(20),
  ]);

  if (cmds.error) return NextResponse.json({ error: cmds.error.message }, { status: 500 });

  return NextResponse.json({
    session_id: sessionID,
    commands: cmds.data || [],
    events: events.data || [],
    responses: responses.data || [],
  });
}
