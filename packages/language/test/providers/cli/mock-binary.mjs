#!/usr/bin/env node
// Mock CLI provider binary. Reads JSON from stdin and emits a deterministic
// JSON response on stdout. Used to exercise the CLI subprocess protocol
// without depending on a real Claude / Codex install.

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const req = JSON.parse(input);
  const lastMessage = req.messages[req.messages.length - 1];
  const response = {
    echo: lastMessage.content,
    role: lastMessage.role,
    temperature: req.temperature ?? null,
  };
  process.stdout.write(JSON.stringify(response));
});
