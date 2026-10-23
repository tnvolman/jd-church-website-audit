"use strict";

/**
 * POST { url, source: "plugin" } to {origin}/api/audit?source=plugin.
 * include_cta is sent only when the caller sets it. false drops cta.
 * The only configuration is JOURNEY_DIGITAL_AUDIT_BASE_URL. There is no API key.
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const { TOOL, toolError } = require("./tool");
const { FORMAT_ERROR, validateReport } = require("./validate-report");

const DEFAULT_BASE = "https://journeydigital.ai";
const REQUEST_TIMEOUT_MS = 90000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

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
  let code = "";
  let message = "";
  let limits = "";
  if (parsed && typeof parsed.error === "string") {
    code = parsed.error.trim();
    message = typeof parsed.message === "string" ? parsed.message.trim() : "";
  } else if (parsed && parsed.error && typeof parsed.error === "object") {
    code = typeof parsed.error.code === "string" ? parsed.error.code.trim() : "";
    message = typeof parsed.error.message === "string" ? parsed.error.message.trim() : "";
    if (
      parsed.error.limits &&
      typeof parsed.error.limits === "object" &&
      Number.isInteger(parsed.error.limits.per_hour) &&
      Number.isInteger(parsed.error.limits.per_day)
    ) {
      limits = ` Limit: ${parsed.error.limits.per_hour} per hour and ${parsed.error.limits.per_day} per day.`;
    }
  }
  if (!message) {
    return toolError(
      `The audit service returned HTTP ${status} without a usable error message, so no check results are shown.`
    );
  }
  const prefix = code ? `${code}: ` : "";
  return toolError(`${prefix}${message}${limits} No check results are shown.`);
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
  if (Object.prototype.hasOwnProperty.call(args, "include_cta") && typeof args.include_cta !== "boolean") {
    return toolError("include_cta must be true or false. No check results are shown.");
  }

  let endpoint;
  try {
    endpoint = endpointFromBase(resolveBase());
  } catch (err) {
    return toolError(`${err.message} No check results are shown.`);
  }

  const payload = { url: args.url.trim(), source: "plugin" };
  if (typeof args.include_cta === "boolean") payload.include_cta = args.include_cta;

  let response;
  try {
    response = await postJson(endpoint, payload);
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
    structuredContent: validated.report,
    isError: false,
  };
}

module.exports = { auditTool };
