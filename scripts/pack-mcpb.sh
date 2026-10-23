#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

mkdir -p "$staging/server" "$staging/assets"
cp "$root/mcpb/manifest.json" "$staging/manifest.json"
cp "$root/server/audit-mcp.js" "$staging/server/audit-mcp.js"
cp "$root/assets/icon.png" "$staging/assets/icon.png"

out="${1:-$root/dist/jd-church-website-audit.mcpb}"
mkdir -p "$(dirname "$out")"

npx --yes @anthropic-ai/mcpb@2.1.2 validate "$staging/manifest.json"
npx --yes @anthropic-ai/mcpb@2.1.2 pack "$staging" "$out"
npx --yes @anthropic-ai/mcpb@2.1.2 info "$out"

sha256sum "$out"
