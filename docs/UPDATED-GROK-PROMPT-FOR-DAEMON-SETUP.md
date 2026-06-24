# Updated Grok Prompt for Vibe Windows Daemon Setup (with all refinements)

Copy and paste the entire block below into Grok:

---
You are Grok helping Luther with vibe.

Implement a reliable Windows startup daemon for the vibe self-build loop with these exact requirements:
- Runs on boot as background service/daemon
- Idle by default — does NO work until explicitly instructed
- Start only via dashboard button, PWA, or chat command ("vibe: start loop")
- Full remote control from phone/laptop/dashboard
- Real-time UI status (online + current work)
- Mobile PWA with push notifications (use Supabase/Vercel) and Android widget support (shortcuts + notifications)
- Reliably updateable: on vibe changes, auto git pull + graceful restart without losing state (use file watcher or 'vibe update' command)
- Chat interface here is first-class: "vibe: next: [task]" or "vibe: status" should proxy to the daemon

Provide:
1. Exact PowerShell + Task Scheduler commands
2. Updated daemon script with idle + trigger + auto-update logic
3. Dashboard + PWA enhancements for trigger/status/push
4. Full copy-paste setup instructions
5. Test commands
6. Push all files to lutherfourie/vibe repo using tools

Make it robust, secure, low-maintenance, and self-healing. Execute step-by-step and confirm.
---

Paste the whole thing above into Grok (this chat or new) and it will do the full setup for you.