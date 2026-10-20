#!/usr/bin/env node
// Calls one tool on this MCP server over stdio and prints the result.
//
// The server is only reachable through an MCP client, which makes it awkward to verify a change
// by hand — this is the smallest client that does the job. Dependency-free on purpose: it speaks
// the wire protocol directly rather than importing the SDK, so it also catches framing mistakes
// the SDK would paper over.
//
//   node scripts/mcp-call.mjs --list
//   node scripts/mcp-call.mjs list_projects '{"limit": 3}'
//   node scripts/mcp-call.mjs show_todo '{"id": "123", "project": "Sandbox"}'
//
// Exits 1 when the tool returns isError, so it composes in a shell:
//
//   node scripts/mcp-call.mjs auth_status '{}' >/dev/null || echo "not authenticated"
//
// BASECAMP_BIN is inherited, so a stub binary can stand in for the real CLI to exercise error
// paths that are hard to trigger live (422 validation, 507 account limits):
//
//   BASECAMP_BIN=./stub-cli node scripts/mcp-call.mjs show_todo '{"id": "1"}'

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");
const TIMEOUT_MS = 60_000;
const PROTOCOL_VERSION = "2024-11-05";

const [tool, argsJson] = process.argv.slice(2);

if (!tool || tool === "--help" || tool === "-h") {
  console.error("usage: node scripts/mcp-call.mjs <tool> '<json-args>'\n       node scripts/mcp-call.mjs --list");
  process.exit(tool ? 0 : 2);
}

let toolArgs = {};
if (argsJson) {
  try {
    toolArgs = JSON.parse(argsJson);
  } catch (e) {
    console.error(`invalid JSON arguments: ${e.message}`);
    process.exit(2);
  }
}

const child = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "inherit"] });

const timer = setTimeout(() => {
  console.error(`no response within ${TIMEOUT_MS / 1000}s`);
  child.kill();
  process.exit(1);
}, TIMEOUT_MS);

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

// process.exit() does not wait for stdout: when it is a pipe, writes are asynchronous, and exiting
// at once cut piped results off at the pipe buffer (~64 KB) — a truncation a redirect to a file
// never showed. Exit from the callback of an empty write instead, which fires only after every
// earlier write has flushed. `finished` keeps the killed child's exit event from reporting a
// failure while that flush is pending.
let finished = false;
const finish = (code) => {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  child.kill();
  process.stdout.write("", () => process.exit(code));
};

// Every result payload is a string; pretty-print it when it happens to be JSON, since most tools
// return a JSON document as text.
const print = (text) => {
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
};

let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // not a protocol frame — the server logging to stdout, say
    }

    if (msg.id === 1) {
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send(tool === "--list"
        ? { jsonrpc: "2.0", id: 2, method: "tools/list" }
        : { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: toolArgs } });
    } else if (msg.id === 2) {
      if (msg.error) {
        console.error(`protocol error: ${msg.error.message}`);
        return finish(1);
      }
      if (tool === "--list") {
        for (const t of msg.result.tools) console.log(t.name);
        return finish(0);
      }
      for (const part of msg.result.content ?? []) {
        if (part.type === "text") print(part.text);
      }
      finish(msg.result.isError ? 1 : 0);
    }
  }
});

child.on("error", (e) => {
  console.error(`failed to start the server: ${e.message}`);
  finish(1);
});

child.on("exit", (code) => {
  if (finished) return; // our own kill, after the answer
  console.error(`server exited (code ${code}) before answering`);
  finish(1);
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "mcp-call", version: "1.0.0" },
  },
});
