"use strict";

const { outputSchema } = require("./output-schema");

const TOOL = {
  name: "audit_church_website",
  title: "Audit a church website",
  description:
    "Audits one church homepage for mobile fit, speed, SEO basics, and first-time-guest findability, and returns Journey Digital's report unchanged. " +
    "Use it when the user gives one church website address. Do not use it to crawl a site, to promise a search ranking, or when no address was given. " +
    "Sends that address to journeydigital.ai, which fetches the page, and the speed check to Google PageSpeed. No API key. " +
    "Plugin audits store an anonymous count, so repeating the call records another count, and the church website itself is not modified. " +
    "If the service is unreachable, rate-limited, or the report is malformed, the result is an error and includes no checks. " +
    "Privacy: https://journeydigital.ai/privacy Terms: https://journeydigital.ai/terms",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        minLength: 1,
        description: "One church homepage, with or without https://. Not a list of pages.",
      },
      include_cta: {
        type: "boolean",
        description: "false omits the consultation note (cta). Omit this argument to keep the service default, which includes cta.",
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
  outputSchema,
};

function toolError(text) {
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

module.exports = { TOOL, toolError };
