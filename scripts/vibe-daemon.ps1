# Vibe Persistent Daemon with Auto-Update
# Runs loop, listens for remote commands, auto git pull on vibe changes
Write-Host 'Vibe Daemon Started - Remote control active + Auto-update'
while ($true) { 
  git pull
  # Run self-plan or loop
  Start-Sleep 300 # 5 min check
} # Expand with service management, WebSocket, etc.