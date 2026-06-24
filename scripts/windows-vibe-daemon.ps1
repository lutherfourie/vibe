# Windows Startup Daemon for Vibe Self-Build Loop

# Run on startup:
# - Starts vibe serve/dashboard
# - Runs periodic self:plan or listens for remote commands
# - Updates UI with online state

Start-Process 'pnpm' -ArgumentList 'vibe:serve --daemon' -WindowStyle Hidden
Write-Host 'Vibe daemon started - remote loop active'

# TODO: Integrate with Windows Service (NSSM) for true daemon

# Add to startup via Task Scheduler or registry