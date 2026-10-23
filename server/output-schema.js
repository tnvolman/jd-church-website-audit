"use strict";

/**
 * JSON Schema for the structured report returned by audit_church_website.
 * Describes the service's report. It does not score a site.
 */

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
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
  ],
  properties: {
    url: { type: "string", description: "Address the service checked." },
    final_url: { type: "string", description: "Address after redirects." },
    passed: { type: "integer", minimum: 0, description: "Scored checks the service marked pass." },
    total: { type: "integer", minimum: 0, description: "Scored checks in the service's denominator." },
    couldnt: { type: "integer", minimum: 0, description: "Scored checks the service could not measure." },
    js_heavy: { type: "boolean", description: "True when the homepage looks JavaScript-heavy." },
    speed_source: {
      type: "string",
      enum: ["pagespeed", "fallback"],
      description: "pagespeed when Google PageSpeed returned a score, otherwise fallback.",
    },
    truncated: { type: "boolean", description: "True when the homepage fetch hit the service's byte cap." },
    groups: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "soft", "ids"],
        properties: {
          name: { type: "string" },
          soft: { type: "boolean", description: "True only for heads-up notes, which are not fails." },
          ids: { type: "array", minItems: 1, items: { type: "string" } },
        },
      },
    },
    checks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "group", "verdict", "finding", "source"],
        properties: {
          id: { type: "string" },
          group: { type: "string" },
          verdict: { type: "string", enum: ["pass", "warn", "fail", "info"] },
          finding: { type: "string", description: "Plain-English result from the service." },
          source: { type: "string", description: "Where that measurement came from." },
          label: { type: "string", description: "Short check name, when the service sent one." },
        },
      },
    },
    citations: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url"],
        properties: {
          name: { type: "string" },
          url: { type: "string" },
        },
      },
    },
    disclaimer: { type: "string", description: "Disclaimer text from the service." },
    cta: {
      type: "object",
      additionalProperties: false,
      required: ["text", "url", "email"],
      description: "Consultation note. Absent when include_cta is false.",
      properties: {
        text: { type: "string" },
        url: { type: "string" },
        email: { type: "string" },
      },
    },
  },
};

module.exports = { outputSchema };
