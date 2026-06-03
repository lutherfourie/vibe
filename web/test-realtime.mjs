import { createClient } from "@supabase/supabase-js";

const url = "http://127.0.0.1:54421";
const key = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const sb = createClient(url, key, {
  realtime: { params: { eventsPerSecond: 10 } }
});

console.log("Connecting to local Supabase Realtime...");

let received = 0;
const expected = 2;

const channel = sb
  .channel("test-vibe-realtime")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "autonomous_sessions" }, (payload) => {
    console.log("🔴 LIVE REALTIME EVENT: autonomous_sessions INSERT");
    console.log(JSON.stringify(payload.new, null, 2));
    received++;
    maybeDone();
  })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkpoints" }, (payload) => {
    console.log("🔴 LIVE REALTIME EVENT: checkpoints INSERT");
    console.log(JSON.stringify(payload.new, null, 2));
    received++;
    maybeDone();
  })
  .subscribe((status) => {
    console.log("Subscription status:", status);
    if (status === "SUBSCRIBED") {
      console.log("✅ Subscribed to realtime. Inserting test data now (this is what the dashboard Launch button does)...");
      doInserts();
    }
  });

async function doInserts() {
  const sessionName = "realtime-live-demo-" + Date.now();
  const { data: sess, error: sessErr } = await sb
    .from("autonomous_sessions")
    .insert({
      name: sessionName,
      description: "Supabase Realtime live update test — triggered from command line, should appear instantly in dashboard",
      metadata: { demo: "user asked about supabase live", source: "test-realtime.mjs" }
    })
    .select()
    .single();

  if (sessErr) {
    console.error("Session insert failed:", sessErr.message);
    process.exit(1);
  }
  console.log("Inserted session (DB confirm):", sess.id);

  const { error: cpErr } = await sb.from("checkpoints").insert({
    session_id: sess.id,
    name: "live-realtime-checkpoint",
    resume_strategy: "last-checkpoint"
  });

  if (cpErr) {
    console.error("Checkpoint insert failed:", cpErr.message);
  } else {
    console.log("Inserted checkpoint (DB confirm). Waiting for realtime delivery...");
  }
}

function maybeDone() {
  if (received >= expected) {
    console.log("\n✅ SUCCESS: Received the expected live realtime events from Supabase!");
    console.log("When you have the Next.js dashboard open (pnpm --filter web dev), clicking Launch or running similar inserts will cause the UI list to update automatically.");
    setTimeout(() => {
      sb.removeChannel(channel);
      process.exit(0);
    }, 800);
  }
}

// Safety timeout
setTimeout(() => {
  if (received < expected) {
    console.log("Timeout — did not receive all expected realtime events. Check RLS, realtime enabled in supabase config, and that the dashboard .env.local is correct.");
    process.exit(1);
  }
}, 15000);
