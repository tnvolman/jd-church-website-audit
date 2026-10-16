---
name: present-church-website-audit
description: >
  Present Journey Digital's free church website audit in plain English.
  Use when someone asks to audit, review, or check a church website, or
  after audit_church_website returns. Cite each source exactly. Do not
  invent check results, promise rankings, or hold results behind an offer.
---

# Present a church website audit

Journey Digital is a small, owner-run church web studio in Wilson, NC. It builds church websites anywhere. The audit is published by Michael McClanahan. Support is sales@journeydigital.ai.

This plugin is not endorsed by Cursor or Grok Bot.

## Get the report from the tool

Call `audit_church_website` with the church website address the person gave. Send that address only. Do not fetch the church site yourself, do not call `https://journeydigital.ai/audit`, and do not score the page yourself.

The tool returns either the service's report or an error. It does not invent a check.

If the tool returns an error, or its text says no check results are shown, repeat that error in plain English and stop. Do not fill in checks from your own reading of the site. Do not estimate a verdict.

## Say only what was measured

Use the report as the whole result. Every check in `checks` is part of the free report. Show them all before you mention the offer.

Lead with the returned counts and the final address. Use `passed`, `total`, `couldnt`, and `final_url` as numbers and text from the report. Do not adjust them.

> {passed} of {total} checks passed. {couldnt} could not be checked from the page code. Checked: {final_url}.

Skip the "could not be checked" sentence when `couldnt` is 0.

Add these only when the report says so:

- `speed_source` is `fallback`: the speed line is the service's own estimate because Google PageSpeed did not return a score. Do not call it a Google result.
- `js_heavy` is true: the page showed very little text without JavaScript, so some checks could not see what a visitor sees.
- `truncated` is true: the server marked the page as truncated.

Do not add a grade, a percentile, a comparison to other churches, or a cause that is not written in that check's `finding`.

## How to present each check

Walk `groups` in order. Inside each group, walk `checks` in order and present the matching object from the top-level `checks` array.

For each check:

1. Verdict word, from the returned `verdict` only:
   - `pass` — Pass
   - `fail` — Needs work
   - `warn` — Heads-up. These notes are not counted as a failed check.
   - `info` — Couldn't check, when the finding says the check could not be read or checked. Otherwise Note. Never call an `info` result a pass or a fail.
2. The returned `label` when it is present. When it is absent, use the `id`.
3. The `finding` sentence, unchanged in meaning. Do not extend it.
4. A source line. Copy `source` exactly as returned: same characters, no ellipsis, no correction, no paraphrase.

Example shape:

```text
Mobile

Pass. Mobile viewport tag
The page has a viewport tag that tells phones to fit it to the screen, which is what Lighthouse's viewport audit checks for.
Source: width=device-width, initial-scale=1
```

The source line is evidence, not a new conclusion.

## Limits that are always true of this audit

After the checks, include both of these points. They are limits of the audit, not a verdict on the church:

- Whether service times and the address sit on the first screen of a phone, and whether the phone menu is easy to open and use, need a human look. This audit did not measure either one.
- This report does not promise any search ranking. Passing a check is not a ranking.

Then one privacy sentence, with both links:

The address you submitted was sent to journeydigital.ai and to Google PageSpeed. Plugin audits store anonymous counts only. Privacy: https://journeydigital.ai/privacy Terms: https://journeydigital.ai/terms

## Offer, after the full report

The offer is optional. It never gates a result. Do not move a check below it, and do not say more detail is available after they write.

Close with:

Journey Digital's Founding Church offer is $1,500 for the first 5 churches. You can ask about it at https://journeydigital.ai/audit#contact or sales@journeydigital.ai. If this report was all you needed, that is fine.
