"use strict";

/**
 * Accept only the SPEC.md report. Unknown keys, missing fields, and
 * verdicts outside pass, warn, fail, and info are errors. passed and
 * total are copied through. This module does not score a site.
 */

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
  "groups",
  "checks",
  "citations",
  "disclaimer",
  "cta",
]);
const CHECK_KEYS = new Set(["id", "group", "verdict", "finding", "source", "label"]);
const GROUP_KEYS = new Set(["name", "soft", "ids"]);
const CITATION_KEYS = new Set(["name", "url"]);
const CTA_KEYS = new Set(["text", "url", "email"]);

const FORMAT_ERROR =
  "The audit service returned a response that does not match the report format, so no check results are shown.";

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
    if (!isNonEmptyString(raw.name) || typeof raw.soft !== "boolean") return { ok: false, message: FORMAT_ERROR };
    if (!Array.isArray(raw.ids) || raw.ids.length === 0) return { ok: false, message: FORMAT_ERROR };
    const ids = [];
    for (const id of raw.ids) {
      if (typeof id !== "string" || !seenIds.has(id) || listed.has(id)) return { ok: false, message: FORMAT_ERROR };
      const check = checks.find((item) => item.id === id);
      if (!check || check.group !== raw.name) return { ok: false, message: FORMAT_ERROR };
      listed.add(id);
      ids.push(id);
    }
    groups.push({ name: raw.name, soft: raw.soft, ids });
  }
  if (listed.size !== checks.length) return { ok: false, message: FORMAT_ERROR };

  if (!data.citations || typeof data.citations !== "object" || Array.isArray(data.citations)) {
    return { ok: false, message: FORMAT_ERROR };
  }
  const citations = {};
  for (const key of Object.keys(data.citations)) {
    const item = data.citations[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, message: FORMAT_ERROR };
    if (unknownKeys(item, CITATION_KEYS).length) return { ok: false, message: FORMAT_ERROR };
    if (!isNonEmptyString(item.name) || !isNonEmptyString(item.url)) return { ok: false, message: FORMAT_ERROR };
    citations[key] = { name: item.name, url: item.url };
  }

  if (typeof data.disclaimer !== "string" || data.disclaimer.trim() === "") {
    return { ok: false, message: FORMAT_ERROR };
  }

  let cta;
  if (Object.prototype.hasOwnProperty.call(data, "cta")) {
    const raw = data.cta;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: FORMAT_ERROR };
    if (unknownKeys(raw, CTA_KEYS).length) return { ok: false, message: FORMAT_ERROR };
    if (!isNonEmptyString(raw.text) || !isNonEmptyString(raw.url) || !isNonEmptyString(raw.email)) {
      return { ok: false, message: FORMAT_ERROR };
    }
    cta = { text: raw.text, url: raw.url, email: raw.email };
  }

  const report = {
    url: data.url,
    final_url: data.final_url,
    passed: data.passed,
    total: data.total,
    couldnt: data.couldnt,
    js_heavy: data.js_heavy,
    speed_source: data.speed_source,
    truncated: data.truncated,
    groups,
    checks,
    citations,
    disclaimer: data.disclaimer,
  };
  if (cta) report.cta = cta;
  return { ok: true, report };
}

module.exports = { FORMAT_ERROR, validateReport };
