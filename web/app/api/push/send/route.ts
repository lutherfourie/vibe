import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Sends a web push notification to stored subscribers (for loop alerts).
// Triggered by daemon events, "vibe: " chat commands, or dashboard.
// Requires VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY for real delivery (web-push).
// If keys missing, still records the intent in telemetry.

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: msgBody, url, session_id, tag } = body || {};

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, session_id')
      .limit(500);

    if (error) throw error;

    const payload = {
      title: title || 'Vibe Loop',
      body: msgBody || 'Loop status update',
      url: url || '/',
      tag: tag || 'vibe-loop',
      timestamp: Date.now(),
    };

    // Record intent (visible in dashboard)
    await supabase.from('telemetry_events').insert({
      kind: 'push_notification_sent',
      source: 'web',
      session_id: session_id || null,
      payload: { ...payload, subscriber_count: subs?.length || 0 },
    });

    // Real delivery (optional, best-effort)
    const vapidPub = process.env.VAPID_PUBLIC_KEY;
    const vapidPriv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

    let delivered = 0;
    if (vapidPub && vapidPriv && subs && subs.length > 0) {
      try {
        // dynamic import so the route works even if web-push not installed yet
        const webpush = (await import('web-push')).default;
        webpush.setVapidDetails(subject, vapidPub, vapidPriv);

        for (const sub of subs) {
          const pushSub = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          };
          try {
            await webpush.sendNotification(pushSub as any, JSON.stringify(payload));
            delivered++;
          } catch (e: any) {
            if (e.statusCode === 410 || e.statusCode === 404) {
              // stale subscription
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
          }
        }
      } catch (e) {
        console.warn('web-push delivery skipped (lib or keys issue):', (e as any)?.message);
      }
    }

    return NextResponse.json({
      success: true,
      attempted: subs?.length || 0,
      delivered,
      note: (!vapidPub || !vapidPriv) ? 'VAPID keys not set — real push disabled (event recorded)' : undefined,
    });
  } catch (e: any) {
    console.error('push send error', e);
    return NextResponse.json({ error: e.message || 'error' }, { status: 500 });
  }
}
