#!/usr/bin/env node
"use strict";

/**
 * Church Website Audit MCP server.
 *
 * Zero dependencies. Stdio JSON-RPC, Content-Length framing.
 * One tool, audit_church_website, POSTs { url, source: "plugin" } to
 * {origin}/api/audit?source=plugin.
 *
 * The only configuration is the optional origin override
 * JOURNEY_DIGITAL_AUDIT_BASE_URL. There is no API key.
 *
 * A response that is not the SPEC.md report is an error. This process
 * does not score a site and does not fill in a missing check, verdict,
 * finding, or source.
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const SERVER_NAME = "church-website-audit";
const SERVER_VERSION = "1.0.0";
const DEFAULT_BASE = "https://journeydigital.ai";
const DEFAULT_PROTOCOL = "2024-11-05";
const PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);
const REQUEST_TIMEOUT_MS = 90000;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const VERDICTS = new Set(["pass", "warn", "fail", "info"]);
const SPEED_SOURCES = new Set(["pagespeed", "fallback"]);
const TOP_KEYS = new Set([
  "url",
  "final_url",
  "passed",
  "total",
  "couldnt",
  "js_heavy",
  "speed_source",
  "truncated",
  "checks",
  "groups",
]);
const CHECK_KEYS = new Set(["id", "group", "verdict", "finding", "source", "label"]);
const GROUP_KEYS = new Set(["name", "checks", "soft"]);

const FORMAT_ERROR =
  "The audit service returned a response that does not match the report format, so no check results are shown.";

const TOOL = {
  name: "audit_church_website",
  title: "Audit a church website",
  description:
    "Run Journey Digital's free church website audit for one address. " +
    "Sends that address to journeydigital.ai and, for the speed check, to Google PageSpeed. " +
    "Plugin audits store anonymous counts only. " +
    "Returns the service's report unchanged, or an error. " +
    "Never invents a check, verdict, finding, or source. " +
    "Results are free and complete. Privacy: https://journeydigital.ai/privacy " +
    "Terms: https://journeydigital.ai/terms",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        minLength: 1,
        description: "Church website address, with or without https://.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: {
    title: "Audit a church website",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function toolError(text) {
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function nonNegativeInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function unknownKeys(obj, allowed) {
  return Object.keys(obj).filter((key) => !allowed.has(key));
}

function validateReport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, message: FORMAT_ERROR };
  if (unknownKeys(data, TOP_KEYS).length) return { ok: false, message: FORMAT_ERROR };
  if (!isNonEmptyString(data.url) || !isNonEmptyString(data.final_url)) return { ok: false, message: FORMAT_ERROR };
  if (!nonNegativeInt(data.passed) || !nonNegativeInt(data.total) || !nonNegativeInt(data.couldnt)) {
    return { ok: false, message: FORMAT_ERROR };
  }
  if (data.passed > data.total) return { ok: false, message: FORMAT_ERROR };
  if (typeof data.js_heavy !== "boolean" || typeof data.truncated !== "boolean") {
    return { ok: false, message: FORMAT_ERROR };
  }
  if (!SPEED_SOURCES.has(data.speed_source)) return { ok: false, message: FORMAT_ERROR };
  if (!Array.isArray(data.checks) || data.checks.length === 0) return { ok: false, message: FORMAT_ERROR };
  if (!Array.isArray(data.groups) || data.groups.length === 0) return { ok: false, message: FORMAT_ERROR };
  if (data.couldnt > data.checks.length) return { ok: false, message: FORMAT_ERROR };

  const checks = [];
  const seenIds = new Set();
  for (const raw of data.checks) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: FORMAT_ERROR };
    if (unknownKeys(raw, CHECK_KEYS).length) return { ok: false, message: FORMAT_ERROR };
    if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.group)) return { ok: false, message: FORMAT_ERROR };
    if (!VERDICTS.has(raw.verdict)) return { ok: false, message: FORMAT_ERROR };
    if (typeof raw.finding !== "string" || raw.finding.trim() === "") return { ok: false, message: FORMAT_ERROR };
    if (typeof raw.source !== "string" || raw.source.trim() === "") return { ok: false, message: FORMAT_ERROR };
    if (Object.prototype.hasOwnProperty.call(raw, "label")) {
      if (typeof raw.label !== "string" || raw.label.trim() === "") return { ok: false, message: FORMAT_ERROR };
    }
    if (seenIds.has(raw.id)) return { ok: false, message: FORMAT_ERROR };
    seenIds.add(raw.id);
    const check = {
      id: raw.id,
      group: raw.group,
      verdict: raw.verdict,
      finding: raw.finding,
      source: raw.source,
    };
    if (Object.prototype.hasOwnProperty.call(raw, "label")) check.label = raw.label;
    checks.push(check);
  }

  const listed = new Set();
  const groups = [];
  for (const raw of data.groups) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: FORMAT_ERROR };
    if (unknownKeys(raw, GROUP_KEYS).length) return { ok: false, message: FORMAT_ERROR };
    if (!isNonEmptyString(raw.name) || !Array.isArray(raw.checks) || raw.checks.length === 0) {
      return { ok: false, message: FORMAT_ERROR };
    }
    if (Object.prototype.hasOwnProperty.call(raw, "soft") && typeof raw.soft !== "boolean") {
      return { ok: false, message: FORMAT_ERROR };
    }
    const ids = [];
    for (const id of raw.checks) {
      if (typeof id !== "string" || !seenIds.has(id) || listed.has(id)) return { ok: false, message: FORMAT_ERROR };
      const check = checks.find((item) => item.id === id);
      if (!check || check.group !== raw.name) return { ok: false, message: FORMAT_ERROR };
      listed.add(id);
      ids.push(id);
    }
    const group = { name: raw.name, checks: ids };
    if (Object.prototype.hasOwnProperty.call(raw, "soft")) group.soft = raw.soft;
    groups.push(group);
  }
  if (listed.size !== checks.length) return { ok: false, message: FORMAT_ERROR };

  return {
    ok: true,
    report: {
      url: data.url,
      final_url: data.final_url,
      passed: data.passed,
      total: data.total,
      couldnt: data.couldnt,
      js_heavy: data.js_heavy,
      speed_source: data.speed_source,
      truncated: data.truncated,
      checks,
      groups,
    },
  };
}

function resolveBase() {
  const raw = process.env.JOURNEY_DIGITAL_AUDIT_BASE_URL;
  if (raw == null || String(raw).trim() === "") return DEFAULT_BASE;
  return String(raw).trim();
}

function endpointFromBase(base) {
  let parsed;
  try {
    parsed = new URL(base);
  } catch (_err) {
    throw new Error("JOURNEY_DIGITAL_AUDIT_BASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("JOURNEY_DIGITAL_AUDIT_BASE_URL must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("JOURNEY_DIGITAL_AUDIT_BASE_URL must not include a login.");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("JOURNEY_DIGITAL_AUDIT_BASE_URL is the site origin only, with no path.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("JOURNEY_DIGITAL_AUDIT_BASE_URL must not include a query or hash.");
  }
  const endpoint = new URL("/api/audit", `${parsed.protocol}//${parsed.host}`);
  endpoint.searchParams.set("source", "plugin");
  return endpoint;
}

function postJson(target, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const lib = target.protocol === "https:" ? https : http;
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    method: "POST",
    path: `${target.pathname}${target.search}`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Length": body.length,
      "User-Agent": "JourneyDigitalChurchAuditPlugin/1.0 (+https://journeydigital.ai/audit)",
    },
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error("The audit service response was too large."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error("The audit service did not respond in time."));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function httpError(status, text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    parsed = null;
  }
  const err = parsed && parsed.error && typeof parsed.error === "object" ? parsed.error : null;
  const message = err && typeof err.message === "string" ? err.message.trim() : "";
  if (!message) {
    return toolError(
      `The audit service returned HTTP ${status} without a usable error message, so no check results are shown.`
    );
  }
  const code = err && typeof err.code === "string" && err.code.trim() ? `${err.code}: ` : "";
  let limits = "";
  if (
    err.limits &&
    typeof err.limits === "object" &&
    Number.isInteger(err.limits.per_hour) &&
    Number.isInteger(err.limits.per_day)
  ) {
    limits = ` Limit: ${err.limits.per_hour} per hour and ${err.limits.per_day} per day.`;
  }
  return toolError(`${code}${message}${limits} No check results are shown.`);
}

async function auditTool(params) {
  if (!params || params.name !== TOOL.name) {
    return toolError("Unknown tool. No check results are shown.");
  }
  let args = params.arguments == null ? {} : params.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (_err) {
      args = null;
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return toolError("A church website address is required. No check results are shown.");
  }
  if (typeof args.url !== "string" || args.url.trim() === "") {
    return toolError("A church website address is required. No check results are shown.");
  }

  let endpoint;
  try {
    endpoint = endpointFromBase(resolveBase());
  } catch (err) {
    return toolError(`${err.message} No check results are shown.`);
  }

  let response;
  try {
    response = await postJson(endpoint, { url: args.url.trim(), source: "plugin" });
  } catch (err) {
    const detail = err && err.message ? err.message : "request failed";
    return toolError(`The audit service could not be reached, so no check results are shown. (${detail})`);
  }

  if (response.status !== 200) return httpError(response.status, response.body);

  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch (_err) {
    return toolError(FORMAT_ERROR);
  }
  const validated = validateReport(parsed);
  if (!validated.ok) return toolError(validated.message);
  return {
    content: [{ type: "text", text: JSON.stringify(validated.report, null, 2) }],
    isError: false,
  };
}

function writeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function rpcResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    rpcError(null, -32600, "Invalid Request");
    return;
  }
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const id = hasId ? message.id : undefined;
  if (typeof message.method !== "string") {
    if (hasId) rpcError(id, -32600, "Invalid Request");
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
        "If the tool returns an error, show that error only. Do not invent a check result. " +
        "Results are free and complete.",
    });
    return;
  }
  if (message.method === "ping") {
    rpcResult(id, {});
    return;
  }
  if (message.method === "tools/list") {
    rpcResult(id, { tools: [TOOL] });
    return;
  }
  if (message.method === "tools/call") {
    const params = message.params || {};
    chain = chain.then(() =>
      auditTool(params).then(
        (result) => rpcResult(id, result),
        (err) => {
          const detail = err && err.message ? err.message : "request failed";
          rpcResult(id, toolError(`The audit service could not be reached, so no check results are shown. (${detail})`));
        }
      )
    );
    return;
  }
  rpcError(id, -32601, "Method not found");
}

let buffer = Buffer.alloc(0);
let chain = Promise.resolve();

function consume() {
  while (buffer.length) {
    const sep = buffer.indexOf("\r\n\r\n");
    if (sep === -1) return;
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
    try {
      handle(JSON.parse(body));
    } catch (_err) {
      rpcError(null, -32700, "Parse error");
    }
  }
}

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
