"use strict";

/**
 * Newline-delimited JSON-RPC on stdio. A message that begins with a
 * Content-Length header is read and answered in that framing instead.
 */

const { TOOL, toolError } = require("./tool");
const { auditTool } = require("./audit-client");

const SERVER_NAME = "church-website-audit";
const SERVER_VERSION = "1.0.0";
const DEFAULT_PROTOCOL = "2024-11-05";
const PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

function writeMessage(payload, framing) {
  const json = JSON.stringify(payload);
  if (framing === "content-length") {
    const body = Buffer.from(json, "utf8");
    process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
    process.stdout.write(body);
    return;
  }
  process.stdout.write(json + "\n");
}

function rpcResult(id, result, framing) {
  writeMessage({ jsonrpc: "2.0", id, result }, framing);
}

function rpcError(id, code, message, framing) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } }, framing);
}

function handle(message, framing) {
  const frame = framing === "content-length" ? "content-length" : "ndjson";
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    rpcError(null, -32600, "Invalid Request", frame);
    return;
  }
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const id = hasId ? message.id : undefined;
  if (typeof message.method !== "string") {
    if (hasId) rpcError(id, -32600, "Invalid Request", frame);
    return;
  }
  if (message.method.indexOf("notifications/") === 0) return;

  if (!hasId) return;

  if (message.method === "initialize") {
    const requested = message.params && message.params.protocolVersion;
    rpcResult(id, {
      protocolVersion: PROTOCOL_VERSIONS.has(requested) ? requested : DEFAULT_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions:
        "Call audit_church_website with the church website address. " +
        "Present every returned check in plain English and cite each source exactly as returned. " +
        "Report passed/total exactly as returned. Do not recompute the counts. " +
        "If the tool returns an error, show that error only. Do not invent a check result. " +
        "Results are free and complete.",
    }, frame);
    return;
  }
  if (message.method === "ping") {
    rpcResult(id, {}, frame);
    return;
  }
  if (message.method === "tools/list") {
    rpcResult(id, { tools: [TOOL] }, frame);
    return;
  }
  if (message.method === "tools/call") {
    const params = message.params || {};
    chain = chain.then(() =>
      auditTool(params).then(
        (result) => rpcResult(id, result, frame),
        (err) => {
          const detail = err && err.message ? err.message : "request failed";
          rpcResult(
            id,
            toolError(`The audit service could not be reached, so no check results are shown. (${detail})`),
            frame
          );
        }
      )
    );
    return;
  }
  rpcError(id, -32601, "Method not found", frame);
}

let buffer = Buffer.alloc(0);
let chain = Promise.resolve();

function dispatch(text, framing) {
  try {
    handle(JSON.parse(text), framing);
  } catch (_err) {
    rpcError(null, -32700, "Parse error", framing);
  }
}

function consume() {
  while (buffer.length) {
    if (buffer[0] === 0x0a || buffer[0] === 0x0d) {
      buffer = buffer.slice(1);
      continue;
    }

    if (buffer[0] === 0x7b) {
      const nl = buffer.indexOf(0x0a);
      if (nl === -1) return;
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.length && line[line.length - 1] === 0x0d) line = line.slice(0, -1);
      dispatch(line.toString("utf8"), "ndjson");
      continue;
    }

    const sep = buffer.indexOf("\r\n\r\n");
    if (sep === -1) {
      let bare = -1;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0x0a && (i === 0 || buffer[i - 1] !== 0x0d)) {
          bare = i;
          break;
        }
      }
      if (bare === -1) return;
      buffer = buffer.slice(bare + 1);
      rpcError(null, -32700, "Parse error", "ndjson");
      continue;
    }

    const header = buffer.slice(0, sep).toString("utf8");
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) {
      process.stderr.write("audit-mcp: missing Content-Length\n");
      process.exit(1);
    }
    const length = Number(match[1]);
    if (!Number.isInteger(length) || length < 0 || length > MAX_MESSAGE_BYTES) {
      process.stderr.write("audit-mcp: invalid Content-Length\n");
      process.exit(1);
    }
    const start = sep + 4;
    if (buffer.length < start + length) return;
    const body = buffer.slice(start, start + length).toString("utf8");
    buffer = buffer.slice(start + length);
    dispatch(body, "content-length");
  }
}

function listen() {
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > MAX_MESSAGE_BYTES) {
      process.stderr.write("audit-mcp: message too large\n");
      process.exit(1);
    }
    consume();
  });

  process.stdin.on("end", () => {
    chain.then(() => process.exit(0));
  });
}

module.exports = { listen };
