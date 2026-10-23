#!/usr/bin/env node
"use strict";

/**
 * Church Website Audit MCP server.
 *
 * Zero dependencies. Stdio JSON-RPC. The modules next to this file
 * own the tool schema, report check, HTTP client, and stdio framing.
 * One tool, audit_church_website, POSTs { url, source: "plugin" } to
 * {origin}/api/audit?source=plugin. include_cta is sent only when the
 * caller sets it. false drops cta. The report passes through groups.ids,
 * citations, disclaimer, and cta.
 *
 * The only configuration is the optional origin override
 * JOURNEY_DIGITAL_AUDIT_BASE_URL. There is no API key.
 *
 * A response that is not the SPEC.md report is an error. This process
 * does not score a site, does not recompute passed or total, and does not
 * fill in a missing check, verdict, finding, or source.
 */

require("./stdio").listen();
