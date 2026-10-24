#!/usr/bin/env node
"use strict";

/**
 * Local proof for the church website audit plugin.
 * Talks only to a mock server on 127.0.0.1. Does not call journeydigital.ai.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-report.json"), "utf8"));
const steps = [];

function record(name, ok, detail) {
  steps.push({ name, ok, detail: detail || "" });
  const line = `${ok ? "PASS" : "FAIL"}  ${name}`;
  process.stdout.write(detail && !ok ? `${line}\n${detail}\n` : `${line}\n`);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function pngInfo(rel) {
  const data = fs.readFileSync(path.join(root, rel));
  assert(data.slice(0, 8).toString("binary") === "\x89PNG\r\n\x1a\n", `${rel} is not a PNG`);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos + 8 <= data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.slice(pos + 4, pos + 8).toString("ascii");
    const chunk = data.slice(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert(raw[0] === 0, "icon PNG filter is not 0; corner pixel was not read");
  return {
    width,
    height,
    corner: [raw[1], raw[2], raw[3], raw[4]],
  };
}

function checkManifest() {
  const manifest = JSON.parse(read(".cursor-plugin/plugin.json"));
  const nameOk = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(manifest.name);
  assert(nameOk, `plugin name ${manifest.name} is not kebab-case`);
  assert(manifest.displayName === "Church Website Audit by Journey Digital", "displayName");
  assert(manifest.license === "MIT", "license");
  assert(manifest.author && manifest.author.name === "Michael McClanahan", "author name");
  assert(manifest.author.email === "sales@journeydigital.ai", "author email");
  assert(manifest.publisher === "Michael McClanahan", "publisher");
  assert(manifest.homepage === "https://journeydigital.ai/audit", "homepage");
  assert(manifest.logo === "assets/icon.png", "logo path");
  assert(manifest.skills === "./skills/", "skills path");
  assert(manifest.mcpServers === "./mcp.json", "mcpServers path");
  assert(!manifest.variables, "plugin must not declare secret variables");
  const listing = manifest.description;
  for (const bit of [
    "journeydigital.ai",
    "Google PageSpeed",
    "Plugin audits store anonymous counts only",
    "https://journeydigital.ai/privacy",
    "https://journeydigital.ai/terms",
    "Not endorsed by Cursor or Grok Bot",
  ]) {
    assert(listing.includes(bit), `listing missing: ${bit}`);
  }

  const mcp = JSON.parse(read("mcp.json"));
  const server = mcp.mcpServers["church-website-audit"];
  assert(server && server.type === "stdio", "mcp type");
  assert(server.command === "node", "mcp command");
  assert(Array.isArray(server.args) && server.args.some((arg) => arg.includes("server/audit-mcp.js")), "mcp args");
  assert(server.args.some((arg) => arg.includes("${CURSOR_PLUGIN_ROOT}")), "CURSOR_PLUGIN_ROOT");
  assert(!server.env, "mcp.json must not set env secrets");
  assert(!JSON.stringify(mcp).toLowerCase().includes("api_key"), "mcp api key");
  assert(!JSON.stringify(mcp).toLowerCase().includes("secret"), "mcp secret");

  const icon = pngInfo("assets/icon.png");
  assert(icon.width === icon.height && icon.width === 1024, `icon is ${icon.width}x${icon.height}`);
  assert(icon.corner.join(",") === "17,17,17,255", `icon plate is ${icon.corner.join(",")}`);

  const skill = read("skills/present-church-website-audit/SKILL.md");
  assert(skill.startsWith("---\n"), "skill frontmatter");
  assert(skill.includes("name: present-church-website-audit"), "skill name");
  assert(skill.includes("first screen"), "skill first-screen limit");
  assert(skill.includes("does not promise any search ranking"), "skill ranking limit");
  assert(skill.includes("https://journeydigital.ai/#contact"), "skill CTA link");
  assert(!skill.includes("audit#contact"), "old CTA url");
  assert(skill.includes("disclaimer"), "skill disclaimer");
  assert(skill.includes("cta.text"), "skill shows returned cta");
  assert(skill.includes("sales@journeydigital.ai"), "skill contact");
  assert(!skill.includes("$1,500"), "skill must not hardcode a price");
  assert(skill.includes("cite each source exactly") || skill.includes("Copy `source` exactly"), "skill cites source");
  assert(
    skill.includes("Report the result as `{passed}/{total}` exactly as the API returned `passed` and `total`."),
    "skill score line"
  );
  assert(skill.includes("Do not hardcode `/21`."), "skill rejects a fixed /21");
  assert(skill.includes("Do not add, subtract, or otherwise recompute the counts."), "skill does no client-side math");
  assert(
    skill.includes("A check that could not be run may arrive as `info` or as `fail`."),
    "skill accepts info and fail"
  );
  assert(
    skill.includes("Show that verdict with its `finding` and `source` unchanged."),
    "skill presents verdict unchanged"
  );
  assert(!skill.includes("{passed}/21"), "skill must not print a fixed /21");

  const readme = read("README.md");
  assert(
    readme.includes("Report the result as `passed/total` exactly as the API returns `passed` and `total`."),
    "README score line"
  );
  assert(readme.includes("Do not hardcode `/21` and do not recompute the counts."), "README rejects a fixed /21");
  assert(!readme.includes("passed/21"), "README must not print a fixed /21");

  const license = read("LICENSE");
  assert(license.startsWith("MIT License"), "LICENSE heading");
  assert(license.includes("Copyright (c) 2026 Michael McClanahan"), "LICENSE copyright");

  const privacyBlob = [read("README.md"), read("PRIVACY.md"), listing].join("\n");
  for (const bit of [
    "sent to journeydigital.ai",
    "Google PageSpeed",
    "Plugin audits store anonymous counts only",
    "https://journeydigital.ai/privacy",
    "https://journeydigital.ai/terms",
  ]) {
    assert(read("README.md").includes(bit), `README missing: ${bit}`);
    assert(read("PRIVACY.md").includes(bit), `PRIVACY missing: ${bit}`);
  }
  assert(privacyBlob.includes("Michael McClanahan"), "publisher named");

  const spec = read("SPEC.md");
  assert(spec.includes("source=plugin"), "SPEC query source");
  assert(spec.includes('"source": "plugin"'), "SPEC body source");
  assert(spec.includes("Plugin audits store anonymous counts only"), "SPEC privacy");
  assert(spec.includes("bad_url"), "SPEC 400");
  assert(spec.includes("rate_limited"), "SPEC 429");
  assert(spec.includes("fetch_failed"), "SPEC 502");

  const serverSrc = read("server/audit-mcp.js");
  assert(serverSrc.includes('source: "plugin"'), "server body source");
  assert(serverSrc.includes('searchParams.set("source", "plugin")'), "server query source");
  assert(!serverSrc.includes("require(\"") || serverSrc.match(/require\("([^"]+)"\)/g).every((item) => {
    const name = item.slice(9, -2);
    return ["http", "https", "url"].includes(name);
  }), "server imports a non-builtin");
  assert(!/PAGESPEED_API_KEY|API_KEY|TWILIO|Authorization\s*:|Bearer\s+/i.test(serverSrc), "server mentions a credential");
  assert(!serverSrc.includes("/21"), "server hardcodes /21");
  assert(!/passed\s*[+\-]=/.test(serverSrc), "server adjusts passed");
  assert(serverSrc.includes("structuredContent: validated.report"), "server returns structuredContent");

  const bannedFiles = [
    "README.md",
    "PRIVACY.md",
    "SPEC.md",
    "LICENSE",
    ".cursor-plugin/plugin.json",
    "mcp.json",
    "server/audit-mcp.js",
    "skills/present-church-website-audit/SKILL.md",
    "scripts/build-icon.py",
  ];
  const combined = bannedFiles.map(read).join("\n");
  const bans = [
    [/Cursor AI/i, "Cursor AI"],
    [/results are logged/i, "results are logged"],
    [/\bindependent\b/i, "independent"],
    [/Tabernacle/i, "Tabernacle"],
    [/Typewright/i, "Typewright"],
    [/\bArch\b/, "Arch"],
    [/church studio/, "church studio"],
  ];
  for (const [pattern, label] of bans) {
    assert(!pattern.test(combined), `banned wording: ${label}`);
  }
  assert(!/GPL/.test(combined.replace("No GPL dependencies.", "")), "GPL reference");
  assert(!fs.existsSync(path.join(root, "package.json")), "package.json would add dependencies");
}

function syntaxCheck(rel) {
  const result = spawnSync(process.execPath, ["--check", rel], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${rel} failed node --check`);
  }
}

class Client {
  constructor(child, framing) {
    this.child = child;
    this.framing = framing || "ndjson";
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    this.stderr = "";
    this.lastFraming = "";
    child.stdout.on("data", (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this.drain();
    });
    child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      const err = new Error(`server exited ${code}: ${this.stderr}`);
      while (this.waiters.length) this.waiters.shift().reject(err);
    });
  }

  fail(err) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.reject(err);
  }

  take() {
    if (this.buf[0] === 0x7b) {
      const nl = this.buf.indexOf(0x0a);
      if (nl === -1) return null;
      let line = this.buf.slice(0, nl);
      const rest = this.buf.slice(nl + 1);
      if (line.length && line[line.length - 1] === 0x0d) line = line.slice(0, -1);
      const raw = line.toString("utf8");
      return { framing: "ndjson", msg: JSON.parse(raw), rest, raw };
    }
    const sep = this.buf.indexOf("\r\n\r\n");
    if (sep === -1) return null;
    const header = this.buf.slice(0, sep).toString("utf8");
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) throw new Error(`bad frame header: ${header}`);
    const length = Number(match[1]);
    const start = sep + 4;
    if (this.buf.length < start + length) return null;
    const raw = this.buf.slice(start, start + length).toString("utf8");
    return {
      framing: "content-length",
      msg: JSON.parse(raw),
      rest: this.buf.slice(start + length),
      raw,
    };
  }

  drain() {
    try {
      while (this.waiters.length && this.buf.length) {
        while (this.buf.length && (this.buf[0] === 0x0a || this.buf[0] === 0x0d)) {
          this.buf = this.buf.slice(1);
        }
        if (!this.buf.length) return;
        const taken = this.take();
        if (!taken) return;
        if (this.framing !== "auto" && taken.framing !== this.framing) {
          this.fail(new Error(`expected ${this.framing} framing, got ${taken.framing}`));
          return;
        }
        this.buf = taken.rest;
        this.lastFraming = taken.framing;
        this.waiters.shift().resolve(taken.msg);
      }
    } catch (err) {
      this.fail(err);
    }
  }

  write(obj, options) {
    const framing = (options && options.framing) || (this.framing === "auto" ? "ndjson" : this.framing);
    const pretty = Boolean(options && options.pretty);
    const json = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
    if (framing === "content-length") {
      const body = Buffer.from(json, "utf8");
      this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
      this.child.stdin.write(body);
      return;
    }
    if (json.indexOf("\n") !== -1) throw new Error("newline-delimited message contains a newline");
    this.child.stdin.write(json + "\n");
  }

  request(obj, timeoutMs = 5000, options) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${obj.method}`)), timeoutMs);
      this.waiters.push({
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.write(obj, options);
    });
  }

  notify(obj, options) {
    this.write(obj, options);
  }

  close() {
    this.child.kill();
  }
}

function startClient(baseUrl, extraEnv, framing) {
  const env = { ...process.env, ...(extraEnv || {}) };
  if (baseUrl == null) delete env.JOURNEY_DIGITAL_AUDIT_BASE_URL;
  else env.JOURNEY_DIGITAL_AUDIT_BASE_URL = baseUrl;
  const child = spawn(process.execPath, ["server/audit-mcp.js"], {
    cwd: root,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new Client(child, framing || "ndjson");
}

function startClientFromMcpJson(baseUrl) {
  const mcp = JSON.parse(read("mcp.json"));
  const spec = mcp.mcpServers["church-website-audit"];
  const pluginRoot = root;
  const subst = (value) => String(value).split("${CURSOR_PLUGIN_ROOT}").join(pluginRoot);
  const args = spec.args.map(subst);
  const cwd = subst(spec.cwd);
  const env = { ...process.env, CURSOR_PLUGIN_ROOT: pluginRoot, JOURNEY_DIGITAL_AUDIT_BASE_URL: baseUrl };
  const child = spawn(spec.command, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new Client(child, "ndjson");
  client.launch = { command: spec.command, args, cwd };
  return client;
}

function toolText(response) {
  const result = response && response.result;
  assert(result, `missing result: ${JSON.stringify(response)}`);
  assert(Array.isArray(result.content) && result.content[0] && result.content[0].type === "text", "content");
  return result.content[0].text;
}

function assertNoReport(text) {
  assert(!text.includes('"verdict"'), `error leaked a verdict:\n${text}`);
  assert(!text.includes("UNIQUE_FINDING_SHOULD_NOT_LEAK"), `error leaked a finding:\n${text}`);
  assert(!text.includes("UNIQUE_VERDICT_SHOULD_NOT_LEAK"), `error leaked a finding:\n${text}`);
  assert(text.includes("No check results are shown.") || text.includes("no check results are shown."), text);
}

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  try {
    checkManifest();
    record("manifest", true);
  } catch (err) {
    record("manifest", false, err.stack || err.message);
  }

  for (const rel of ["server/audit-mcp.js", "scripts/prove.js"]) {
    try {
      syntaxCheck(rel);
      record(`node --check ${rel}`, true);
    } catch (err) {
      record(`node --check ${rel}`, false, err.message);
    }
  }

  const hits = [];
  const mock = await listen((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      hits.push({ method: req.method, url: req.url, headers: req.headers, body });
      let target = "";
      try {
        target = JSON.parse(body).url || "";
      } catch (_err) {
        target = "";
      }
      const send = (status, payload) => {
        const raw = JSON.stringify(payload);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(raw);
      };
      if (target.endsWith("/bad")) {
        send(400, {
          error: "bad_url",
          message: "Only http and https website addresses can be checked.",
        });
        return;
      }
      if (target.endsWith("/limit")) {
        send(429, {
          error: "rate_limited",
          message: "Too many audits from this address. Please try again later.",
        });
        return;
      }
      if (target.endsWith("/busy")) {
        res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
        res.end(JSON.stringify({ error: "rate_limited", message: "Busy right now. Try again in a minute." }));
        return;
      }
      if (target.endsWith("/edge502")) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("error code: 502");
        return;
      }
      if (target.endsWith("/down")) {
        send(422, {
          error: "fetch_failed",
          message: "We could not reach that website (ConnectionError).",
        });
        return;
      }
      if (target.endsWith("/malformed")) {
        const broken = JSON.parse(JSON.stringify(fixture));
        delete broken.checks[0].source;
        broken.checks[0].finding = "UNIQUE_FINDING_SHOULD_NOT_LEAK";
        send(200, broken);
        return;
      }
      if (target.endsWith("/badverdict")) {
        const broken = JSON.parse(JSON.stringify(fixture));
        broken.checks[0].verdict = "needs work";
        broken.checks[0].finding = "UNIQUE_VERDICT_SHOULD_NOT_LEAK";
        send(200, broken);
        return;
      }
      if (target.endsWith("/asis")) {
        const payload = JSON.parse(JSON.stringify(fixture));
        const city = payload.checks.find((item) => item.id === "city");
        const beliefs = payload.checks.find((item) => item.id === "beliefs");
        city.verdict = "info";
        city.finding = "We couldn't check this because we couldn't read a city from your address.";
        beliefs.verdict = "fail";
        beliefs.finding = "We couldn't verify beliefs from the page code.";
        payload.passed = 17;
        payload.total = 21;
        payload.couldnt = 2;
        send(200, payload);
        return;
      }
      if (target.endsWith("/ok")) {
        const payload = JSON.parse(JSON.stringify(fixture));
        let includeCta = true;
        try {
          if (JSON.parse(body).include_cta === false) includeCta = false;
        } catch (_err) {
          includeCta = true;
        }
        if (!includeCta) delete payload.cta;
        send(200, payload);
        return;
      }
      send(500, { error: { code: "audit_failed", message: "Unexpected mock target." } });
    });
  });

  const origin = `http://127.0.0.1:${mock.address().port}`;
  const client = startClient(origin, {
    PAGESPEED_API_KEY: "supersecret-should-not-leak",
    AUDIT_API_KEY: "another-secret",
  });

  let sample = "";
  try {
    const init = await client.request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "prove", version: "0.0.0" },
      },
    });
    assert(init.result && init.result.protocolVersion === "2024-11-05", "protocol");
    assert(init.result.serverInfo.name === "church-website-audit", "server name");
    assert(init.result.capabilities && init.result.capabilities.tools, "tools capability");
    assert(client.lastFraming === "ndjson", "initialize response is newline-delimited");
    client.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
    record("initialize", true);
  } catch (err) {
    record("initialize", false, `${err.message}\n${client.stderr}`);
  }

  try {
    const listed = await client.request({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = listed.result && listed.result.tools;
    assert(Array.isArray(tools) && tools.length === 1, "expected one tool");
    assert(tools[0].name === "audit_church_website", "tool name");
    assert(tools[0].inputSchema.required.includes("url"), "url required");
    record("tools/list", true, tools[0].name);
  } catch (err) {
    record("tools/list", false, `${err.message}\n${client.stderr}`);
  }

  try {
    const before = hits.length;
    const call = await client.request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "audit_church_website", arguments: { url: "https://grace.example/ok" } },
    });
    const text = toolText(call);
    assert(call.result.isError === false, "isError should be false");
    const report = JSON.parse(text);
    assert(deepEqual(report, fixture), `report was rewritten:\n${text}`);
    assert(deepEqual(call.result.structuredContent, report), "structuredContent matches text");
    const hit = hits[hits.length - 1];
    assert(hits.length === before + 1, "mock was not called once");
    assert(hit.method === "POST", "method");
    assert(hit.url === "/api/audit?source=plugin", `path ${hit.url}`);
    assert(deepEqual(JSON.parse(hit.body), { url: "https://grace.example/ok", source: "plugin" }), `body ${hit.body}`);
    assert(!Object.prototype.hasOwnProperty.call(JSON.parse(hit.body), "include_cta"), "default body omits include_cta");
    assert(!hit.headers.authorization, "authorization header");
    const raw = `${hit.url}\n${hit.body}\n${JSON.stringify(hit.headers)}`;
    assert(!raw.includes("supersecret-should-not-leak"), "PAGESPEED key leaked");
    assert(!raw.includes("another-secret"), "AUDIT key leaked");
    sample = text;
    assert(report.disclaimer === fixture.disclaimer, "disclaimer passed through");
    assert(report.cta.url === "https://journeydigital.ai/#contact", "cta url");
    assert(report.groups[0].ids[0] === "viewport", "group ids");
    record("tools/call mock SPEC report", true, `${report.checks.length} checks`);
  } catch (err) {
    record("tools/call mock SPEC report", false, `${err.message}\n${client.stderr}`);
  }

  try {
    const before = hits.length;
    const call = await client.request({
      jsonrpc: "2.0",
      id: "nocta",
      method: "tools/call",
      params: {
        name: "audit_church_website",
        arguments: { url: "https://grace.example/ok", include_cta: false },
      },
    });
    const text = toolText(call);
    assert(call.result.isError === false, "isError should be false");
    const report = JSON.parse(text);
    assert(deepEqual(call.result.structuredContent, report), "structuredContent matches text");
    assert(!Object.prototype.hasOwnProperty.call(report, "cta"), "cta must be absent");
    assert(!Object.prototype.hasOwnProperty.call(call.result.structuredContent, "cta"), "structuredContent omits cta");
    assert(report.disclaimer === fixture.disclaimer, "disclaimer remains");
    assert(deepEqual(report.citations, fixture.citations), "citations passed through");
    assert(report.checks.length === fixture.checks.length, "checks dropped");
    const hit = hits[hits.length - 1];
    assert(hits.length === before + 1, "mock call");
    assert(
      deepEqual(JSON.parse(hit.body), {
        url: "https://grace.example/ok",
        source: "plugin",
        include_cta: false,
      }),
      `body ${hit.body}`
    );
    record("include_cta false drops cta", true);
  } catch (err) {
    record("include_cta false drops cta", false, `${err.message}\n${client.stderr}`);
  }

  try {
    const call = await client.request({
      jsonrpc: "2.0",
      id: "asis",
      method: "tools/call",
      params: { name: "audit_church_website", arguments: { url: "https://grace.example/asis" } },
    });
    const text = toolText(call);
    assert(call.result.isError === false, "isError should be false");
    const report = JSON.parse(text);
    const city = report.checks.find((item) => item.id === "city");
    const beliefs = report.checks.find((item) => item.id === "beliefs");
    assert(city.verdict === "info", "couldn't-run info verdict");
    assert(city.finding === "We couldn't check this because we couldn't read a city from your address.", "info finding");
    assert(beliefs.verdict === "fail", "couldn't-run fail verdict");
    assert(beliefs.finding === "We couldn't verify beliefs from the page code.", "fail finding");
    assert(beliefs.source === "homepage_html", "fail source");
    assert(report.passed === 17 && report.total === 21 && report.couldnt === 2, "counts were recomputed");
    assert(deepEqual(call.result.structuredContent, report), "structuredContent matches text");
    record("passed/total and both couldn't-run verdicts pass through", true, `${report.passed}/${report.total}`);
  } catch (err) {
    record("passed/total and both couldn't-run verdicts pass through", false, `${err.message}\n${client.stderr}`);
  }

  async function expectClosed(name, url, includes) {
    try {
      const call = await client.request({
        jsonrpc: "2.0",
        id: name,
        method: "tools/call",
        params: { name: "audit_church_website", arguments: { url } },
      });
      const text = toolText(call);
      assert(call.result.isError === true, "isError should be true");
      assert(call.result.structuredContent == null, "error has no structuredContent");
      assertNoReport(text);
      for (const bit of includes) assert(text.includes(bit), `missing "${bit}" in:\n${text}`);
      record(name, true);
    } catch (err) {
      record(name, false, err.message);
    }
  }

  await expectClosed("fail-closed 400 bad URL", "https://grace.example/bad", [
    "bad_url",
    "Only http and https website addresses can be checked.",
  ]);
  await expectClosed("fail-closed 429 rate limit", "https://grace.example/limit", [
    "rate_limited",
    "Too many audits from this address. Please try again later.",
  ]);
  await expectClosed("fail-closed edge 502 with bare body", "https://grace.example/edge502", [
    "gateway returned HTTP 502",
    "try again in a minute",
  ]);
  await expectClosed("429 busy uses Retry-After", "https://grace.example/busy", [
    "rate_limited: Busy right now.",
    "try again in about 60 seconds",
  ]);
  await expectClosed("local reject localhost trailing dot", "http://localhost./", ["private network"]);
  await expectClosed("local reject ::ffff: mapped", "http://[::ffff:127.0.0.1]/", ["private network"]);
  await expectClosed("local reject ::", "http://[::]/", ["private network"]);
  await expectClosed("local reject fe80::/10 (febf)", "http://[febf::1]/", ["private network"]);
  await expectClosed("local reject 100.64.0.0/10", "http://100.100.1.1/", ["private network"]);
  await expectClosed("local reject ftp scheme", "ftp://grace.example/", ["bad_url", "Only http and https"]);
  await expectClosed("local reject localhost", "http://localhost/", ["private network"]);
  await expectClosed("local reject private IP", "http://192.168.1.10/", ["private network"]);
  await expectClosed("local reject login in URL", "https://a:b@grace.example/", ["logins"]);
  await expectClosed("local reject spaces", "grace church.org", ["no spaces"]);
  await expectClosed("fail-closed 422 fetch failure", "https://grace.example/down", [
    "fetch_failed",
    "We could not reach that website (ConnectionError).",
  ]);
  await expectClosed("fail-closed malformed report (missing source)", "https://grace.example/malformed", [
    "does not match the report format",
  ]);
  await expectClosed("fail-closed non-SPEC verdict", "https://grace.example/badverdict", [
    "does not match the report format",
  ]);

  try {
    const before = hits.length;
    const call = await client.request({
      jsonrpc: "2.0",
      id: "blank",
      method: "tools/call",
      params: { name: "audit_church_website", arguments: { url: "   " } },
    });
    const text = toolText(call);
    assert(call.result.isError === true, "blank url should error");
    assert(call.result.structuredContent == null, "error has no structuredContent");
    assertNoReport(text);
    assert(hits.length === before, "blank url must not call the service");
    record("fail-closed blank url", true);
  } catch (err) {
    record("fail-closed blank url", false, err.message);
  }

  client.close();

  const badBase = startClient(`${origin}/not-an-origin`);
  try {
    const before = hits.length;
    const init = await badBase.request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "prove", version: "0.0.0" } },
    });
    assert(init.result, "init");
    badBase.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
    const call = await badBase.request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "audit_church_website", arguments: { url: "https://grace.example/ok" } },
    });
    const text = toolText(call);
    assert(call.result.isError === true, "bad base should error");
    assert(call.result.structuredContent == null, "error has no structuredContent");
    assertNoReport(text);
    assert(text.includes("origin only"), text);
    assert(hits.length === before, "bad base must not call the service");
    record("fail-closed bad base URL", true);
  } catch (err) {
    record("fail-closed bad base URL", false, `${err.message}\n${badBase.stderr}`);
  }
  badBase.close();

  const down = startClient("http://127.0.0.1:9");
  try {
    const init = await down.request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "prove", version: "0.0.0" } },
    });
    assert(init.result, "init");
    down.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
    const call = await down.request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "audit_church_website", arguments: { url: "https://grace.example/ok" } },
    });
    const text = toolText(call);
    assert(call.result.isError === true, "unreachable should error");
    assert(call.result.structuredContent == null, "error has no structuredContent");
    assertNoReport(text);
    assert(/could not be reached/i.test(text), text);
    assert(!text.includes("grace.example"), "unreachable must not invent the fixture");
    record("fail-closed unreachable", true);
  } catch (err) {
    record("fail-closed unreachable", false, `${err.message}\n${down.stderr}`);
  }
  down.close();

  const framed = startClient(origin, {}, "content-length");
  try {
    const init = await framed.request(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "prove", version: "0.0.0" },
        },
      },
      5000,
      { pretty: true }
    );
    assert(init.result && init.result.serverInfo.name === "church-website-audit", "content-length init");
    assert(framed.lastFraming === "content-length", "content-length response framing");
    framed.notify({ jsonrpc: "2.0", method: "notifications/initialized" }, { pretty: true });
    const listed = await framed.request({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert(listed.result.tools[0].name === "audit_church_website", "content-length tools/list");
    assert(framed.lastFraming === "content-length", "content-length list framing");
    const call = await framed.request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "audit_church_website", arguments: { url: "https://grace.example/ok" } },
    });
    const report = JSON.parse(toolText(call));
    assert(deepEqual(report, fixture), "content-length report");
    assert(deepEqual(call.result.structuredContent, report), "content-length structuredContent");
    record("content-length framing", true);
  } catch (err) {
    record("content-length framing", false, `${err.message}\n${framed.stderr}`);
  }
  framed.close();

  const mixed = startClient(origin, {}, "auto");
  try {
    const init = await mixed.request(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "prove", version: "0.0.0" },
        },
      },
      5000,
      { framing: "content-length" }
    );
    assert(init.result && init.result.protocolVersion === "2024-11-05", "mixed init");
    assert(mixed.lastFraming === "content-length", "first response follows content-length");
    const listed = await mixed.request(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      5000,
      { framing: "ndjson" }
    );
    assert(listed.result.tools[0].name === "audit_church_website", "mixed tools/list");
    assert(mixed.lastFraming === "ndjson", "second response follows newline-delimited");
    record("framing auto-detect per message", true);
  } catch (err) {
    record("framing auto-detect per message", false, `${err.message}\n${mixed.stderr}`);
  }
  mixed.close();

  const launched = startClientFromMcpJson(origin);
  try {
    assert(launched.launch.command === "node", "mcp command");
    assert(launched.launch.cwd === root, "mcp cwd");
    assert(
      launched.launch.args.length === 1 && launched.launch.args[0] === path.join(root, "server/audit-mcp.js"),
      `mcp args ${launched.launch.args.join(" ")}`
    );
    assert(!launched.launch.args.some((arg) => arg.includes("${CURSOR_PLUGIN_ROOT}")), "unsubstituted plugin root");
    const init = await launched.request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "prove", version: "0.0.0" },
      },
    });
    assert(init.result && init.result.protocolVersion === "2024-11-05", "mcp.json protocol");
    assert(launched.lastFraming === "ndjson", "mcp.json spawn speaks newline-delimited JSON");
    launched.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
    const listed = await launched.request({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert(listed.result.tools[0].name === "audit_church_website", "mcp.json tools/list");
    assert(launched.lastFraming === "ndjson", "mcp.json tools/list framing");
    record("spawn as mcp.json", true);
  } catch (err) {
    record("spawn as mcp.json", false, `${err.message}\n${launched.stderr}`);
  }
  launched.close();

  mock.close();

  const failed = steps.filter((step) => !step.ok).length;
  process.stdout.write(`\n${steps.length - failed}/${steps.length} passed\n`);
  if (sample) {
    process.stdout.write("\n----- sample tools/call text -----\n");
    process.stdout.write(sample);
    process.stdout.write("\n----- end sample -----\n");
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
