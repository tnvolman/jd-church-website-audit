# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `Dockerfile` and `.dockerignore`: stdio image on digest-pinned `node:22-alpine`, no npm install, non-root `node` user. `.dockerignore` skips `.env` and `node_modules`.
- Glama score and card badges in the README.
- `outputSchema` on `audit_church_website`, plus when-to-call notes in the tool description. The four MCP annotation hints were already set and are unchanged.
- Registry prep only: `server.json` for `io.github.tnvolman/jd-church-website-audit`, the MCPB manifest and `scripts/build-mcpb.js`, and `glama.json`. Nothing was published.

### Changed
- Rewrote the README: one-line pitch, a real example audit image (`docs/example-audit.png`), a one-line install, MCP config, and contributing notes.

### Added
- `docs/example-audit.png` and `docs/example-audit-redeemer.json`, real output from a public church homepage.
- This changelog.

## [1.0.0] - 2026-10-16

### Added
- Stdio MCP server (`server/audit-mcp.js`, zero dependencies) with one tool, `audit_church_website`, that posts to `/api/audit?source=plugin` and fails closed on missing or malformed reports.
- Cursor plugin manifest, `mcp.json`, the `present-church-website-audit` skill, `SPEC.md`, `PRIVACY.md`, icon and build script, MIT license.
- `scripts/prove.js` self-test against a mock server.

### Changed
- Accept the live report fields: group ids, citations, disclaimer and `cta`; send `include_cta` only when asked.
- Speak newline-delimited MCP stdio and pass `passed`/`total` through unchanged (#1).

### Fixed
- Kept the mock audit report internally consistent.

[Unreleased]: https://github.com/tnvolman/jd-church-website-audit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tnvolman/jd-church-website-audit/releases/tag/v1.0.0
