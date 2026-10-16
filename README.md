# Church Website Audit by Journey Digital

A free Cursor and Grok Bot plugin that asks Journey Digital to check one church homepage and then explains the report in plain English.

Journey Digital is a small, owner-run church web studio in Wilson, NC. It builds church websites anywhere. The publisher is Michael McClanahan, not a company. The only contact is sales@journeydigital.ai.

This plugin is not endorsed by Cursor or Grok Bot.

The audit reports mobile basics, Google PageSpeed speed, SEO basics, whether a first-time guest can find service times, the address, an I'm New path, a map, tap-to-call, giving, beliefs, and the city, plus heads-up notes. Every returned check is part of the result. The report is free and complete. Report the result as `passed/total` exactly as the API returns `passed` and `total`. Do not hardcode `/21` and do not recompute the counts. The consultation note is the returned `cta`, and its link is https://journeydigital.ai/#contact. Sending `include_cta: false` leaves that note off. Nothing is held back either way.

It does not promise a search ranking. First-screen placement of service times and the address, and whether the phone menu is easy to use, need a human look.

## Privacy

The church website address you submit is sent to journeydigital.ai, which fetches that page. The speed check sends that address to Google PageSpeed.

Plugin audits store anonymous counts only.

- Privacy policy: https://journeydigital.ai/privacy
- Terms: https://journeydigital.ai/terms
- Notes in this repo: [PRIVACY.md](PRIVACY.md)

## What is in this repo

| Path | Purpose |
| --- | --- |
| `SPEC.md` | JSON contract for `POST /api/audit`. Journey Digital adds this to the-forge. Scoring stays in `jd_audit.py`. |
| `.cursor-plugin/plugin.json` | Plugin manifest. |
| `mcp.json` | Stdio MCP server entry. |
| `server/audit-mcp.js` | Zero-dependency Node server. One tool, `audit_church_website`. |
| `skills/present-church-website-audit/SKILL.md` | How to present the report. |
| `assets/icon.png` | 1:1 icon. |

The tool POSTs `{"url","source":"plugin"}` to `{origin}/api/audit?source=plugin`. The origin defaults to `https://journeydigital.ai`. Set `JOURNEY_DIGITAL_AUDIT_BASE_URL` to another origin if you need one. There is no API key and no other secret.

Until that JSON route is live, the tool returns an error. It does not invent check results, and it does not call the HTML form at `/audit`.

## Prove it locally

```bash
node --check server/audit-mcp.js
node scripts/prove.js
```

`scripts/prove.js` checks the manifest, syntax, MCP `initialize`, `tools/list`, a `tools/call` against a mock server that returns the SPEC shape, and the fail-closed cases. It does not call the live audit.

## Icon

`assets/icon.png` is the mark from https://journeydigital.ai/static/journeydigital_mark.png, centered and unscaled on a solid `#111111` plate. That plate color is the site background, `--bg`, on https://journeydigital.ai/audit. `scripts/build-icon.py` rebuilds it from that URL.

## License

[MIT](LICENSE). Copyright 2026 Michael McClanahan. No GPL dependencies.
