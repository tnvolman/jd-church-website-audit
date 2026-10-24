#!/usr/bin/env node
"use strict";

/**
 * Pack a local MCPB and confirm it still matches the published v1.0.1 asset.
 *
 * Writes dist/jd-church-website-audit.mcpb. Does not publish, and does not
 * create or edit a GitHub release. server.json fileSha256 is the SHA-256 of
 * the asset already attached to the v1.0.1 release. A local rebuild uses a
 * fixed timestamp, so its hash will differ from that asset even when the
 * three packed files are identical.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "dist", "jd-church-website-audit.mcpb");

const RELEASE_URL =
  "https://github.com/tnvolman/jd-church-website-audit/releases/download/v1.0.1/jd-church-website-audit.mcpb";
const RELEASE_SHA256 = "2683595ad3565f497a7501fe4ef1de56064f2d010b81c4195e679d5d8a4791ee";

const MEMBERS = [
  {
    name: "manifest.json",
    source: "mcpb/manifest.json",
    sha256: "480546a992dbbade3718c265b752dd541fd5c4a3c53df5e1e4e7c0828d4bea32",
    mode: 0o644,
  },
  {
    name: "assets/icon.png",
    source: "assets/icon.png",
    sha256: "ab6afeceba058d6e9c703221dff1133aac163783f96027038162f86ede8a0186",
    mode: 0o644,
  },
  {
    name: "server/audit-mcp.js",
    source: "server/audit-mcp.js",
    sha256: "214a5d0fd9e3b83908794f85f71472913f7e1af44562837d25d44001abb0bdb2",
    mode: 0o755,
  },
];

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(entries) {
  // 2026-01-01 00:00:00, stored, no extra fields. Two runs produce one hash.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localBuf = Buffer.concat([local, name, data]);
    locals.push(localBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(entry.mode << 16, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localBuf.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const serverJson = JSON.parse(fs.readFileSync(path.join(root, "server.json"), "utf8"));
  const pkg = serverJson.packages && serverJson.packages[0];
  if (!pkg || pkg.registryType !== "mcpb") fail("server.json package is not mcpb");
  if (pkg.identifier !== RELEASE_URL) fail("server.json identifier is not the v1.0.1 release asset");
  if (pkg.fileSha256 !== RELEASE_SHA256) fail("server.json fileSha256 is not the v1.0.1 release asset");
  if (serverJson.name !== "io.github.tnvolman/jd-church-website-audit") {
    fail("server.json name is not io.github.tnvolman/jd-church-website-audit");
  }

  const entries = [];
  for (const member of MEMBERS) {
    const data = fs.readFileSync(path.join(root, member.source));
    const hash = sha256(data);
    if (hash !== member.sha256) {
      fail(
        `${member.source} changed (${hash}). The v1.0.1 asset ${RELEASE_SHA256} no longer matches. ` +
          "Rebuild, replace that release asset, and update server.json fileSha256 before publishing."
      );
    }
    entries.push({ name: member.name, data, mode: member.mode });
  }

  const packed = zipStore(entries);
  const packedHash = sha256(packed);
  if (checkOnly) {
    const again = sha256(zipStore(entries));
    if (again !== packedHash) fail("MCPB rebuild is not deterministic");
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, packed);
    const written = sha256(fs.readFileSync(outPath));
    if (written !== packedHash) fail("wrote a different MCPB than the one just packed");
  }

  process.stdout.write(`release ${RELEASE_SHA256}\n`);
  process.stdout.write(`rebuild ${packedHash}\n`);
  if (process.exitCode) return;
  process.stdout.write(checkOnly ? "check ok\n" : `${path.relative(root, outPath)} ok\n`);
}

main();
