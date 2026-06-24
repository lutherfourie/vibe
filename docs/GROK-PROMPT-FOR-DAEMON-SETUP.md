# Grok Prompt to Set Up Vibe Windows Daemon + Reliable Updates

Copy and paste this entire prompt into Grok (or me in a new chat):

---
You are Grok helping Luther set up a reliable Windows startup daemon for the vibe project.

Requirements:
- Runs on boot
- Executes the self-build/dogfood loop
- Allows full remote control from phone/laptop (via dashboard or API)
- Shows online state + current work in the vibe dashboard
- Must be easily updateable: on code changes, auto git pull + restart daemon without manual intervention (use watchdog, file watcher, or GitHub webhook trigger)

Give me:
1. Exact PowerShell + Task Scheduler commands
2. Updated daemon script with auto-update logic
3. Dashboard enhancement code
4. Full setup steps for Windows
5. Test commands

Make it robust, secure, and self-healing. Use existing Supabase/Vercel infra where possible.

Execute by pushing the files to my repo if possible, or give complete copy-paste instructions.
---

Paste that into Grok and it will handle everything end-to-end, including updates.