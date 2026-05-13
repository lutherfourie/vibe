/**
 * LSP smoke test — spawn the language server over stdio and send an
 * `initialize` request. Confirms the server binary exists, starts,
 * and replies with capabilities. Used as a Task 21 sanity gate.
 *
 * Usage: node scripts/lsp-smoke.mjs
 * Exits 0 on a valid initialize response, non-zero otherwise.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, "..", "dist", "language-server.js");

const child = spawn(process.execPath, [serverPath, "--stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = Buffer.alloc(0);
let resolved = false;
const timeout = setTimeout(() => {
  if (resolved) return;
  console.error("LSP smoke: timed out waiting for initialize response");
  child.kill();
  process.exit(2);
}, 10000);

child.stderr.on("data", (chunk) => {
  process.stderr.write(`[lsp stderr] ${chunk}`);
});

child.on("error", (err) => {
  console.error("LSP smoke: failed to spawn:", err);
  process.exit(3);
});

child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  // LSP framing: Content-Length: N\r\n\r\n<json>
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      console.error("LSP smoke: malformed header:", header);
      process.exit(4);
    }
    const len = parseInt(match[1], 10);
    const total = headerEnd + 4 + len;
    if (buffer.length < total) return;
    const body = buffer.subarray(headerEnd + 4, total).toString("utf8");
    buffer = buffer.subarray(total);
    let msg;
    try {
      msg = JSON.parse(body);
    } catch (err) {
      console.error("LSP smoke: bad JSON:", body);
      process.exit(5);
    }
    if (msg.id === 1 && msg.result && msg.result.capabilities) {
      resolved = true;
      clearTimeout(timeout);
      console.log("LSP smoke: initialize OK");
      console.log(
        "  capabilities keys:",
        Object.keys(msg.result.capabilities).sort().join(", "),
      );
      child.kill();
      process.exit(0);
    }
  }
});

function send(obj) {
  const json = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
  child.stdin.write(header + json);
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    clientInfo: { name: "lsp-smoke", version: "0.0.0" },
  },
});
