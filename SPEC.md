# Church website audit JSON endpoint

Proposed contract for Journey Digital to add to the-forge. The live page at [https://journeydigital.ai/audit](https://journeydigital.ai/audit) stays a human form. This document does not change how a check is scored.

Scoring already lives in `tnvolman/the-forge` `src/routes/jd_audit.py`, function `run_audit()`. The new route serializes that return value. It does not copy the thresholds, the HTML parser, or the check functions into a second implementation.

Field names below are the names `run_audit()` already returns (`url`, `final_url`, `passed`, `total`, `couldnt`, `js_heavy`, `speed_source`, `truncated`, `checks`, `groups`, and each check's `key`, `group`, `verdict`, `explanation`, `detail`). The JSON check object uses the names this plugin reads. The mapping table is the whole translation.

## Request

`POST https://journeydigital.ai/api/audit?source=plugin`

`Content-Type: application/json`

```json
{
  "url": "https://example.org",
  "source": "plugin"
}
```

| Input | Rule |
| --- | --- |
| `url` | Required string. The church address as submitted. `normalize_url()` in `jd_audit.py` already accepts a host without a scheme. |
| `source` | Required. The query parameter and the JSON field are both the exact string `plugin`. The plugin sends both on every request. |

Missing or mismatched `source` is `400` with `error.code` `bad_request` and `error.message` `source must be plugin.` This route does not take an email address.

The plugin calls only this path. It does not call `POST /audit`.

## Success, HTTP 200

```json
{
  "url": "https://example.org/",
  "final_url": "https://www.example.org/",
  "passed": 17,
  "total": 20,
  "couldnt": 1,
  "js_heavy": false,
  "speed_source": "pagespeed",
  "truncated": false,
  "checks": [
    {
      "id": "viewport",
      "group": "Mobile",
      "verdict": "pass",
      "finding": "The page has a viewport tag that tells phones to fit it to the screen, which is what Lighthouse's viewport audit checks for.",
      "source": "width=device-width, initial-scale=1"
    }
  ],
  "groups": [
    {
      "name": "Mobile",
      "checks": ["viewport", "zoom", "font_size"]
    }
  ]
}
```

### Run metadata

These keys match `run_audit()` and keep the same meaning.

| Field | Type | Meaning, unchanged from `run_audit()` |
| --- | --- | --- |
| `url` | string | Address after `normalize_url()`. |
| `final_url` | string | Address after redirects (`page["final_url"]`). |
| `passed` | integer | Count of scored checks whose `jd_audit.py` verdict is `pass`. |
| `total` | integer | Scored checks minus checks whose verdict is `couldn't check`. |
| `couldnt` | integer | Count of scored checks whose verdict is `couldn't check`. |
| `js_heavy` | boolean | `is_js_heavy()`. |
| `speed_source` | string | `pagespeed` when Google PageSpeed returned a score, otherwise `fallback`. |
| `truncated` | boolean | The homepage fetch hit the existing byte cap. |

`passed`, `total`, and `couldnt` are that function's counts. Heads-up notes are not included in them. Do not recompute the counts in the serializer.

### Each check

| JSON field | Source in `jd_audit.py` |
| --- | --- |
| `id` | `key` |
| `group` | `group` |
| `verdict` | `verdict`, mapped in the table below |
| `finding` | `explanation`. When `detail` is a non-empty string, append one space and `detail`. |
| `source` | The measurement that check already computed. A new string field. Not a new test. |
| `label` | Optional. The existing `label`, when included. |

`source` is required and non-empty. It is exactly what was measured or fetched: a viewport string, a title, a byte size, a PageSpeed number, a href, a path. It is not advice and it is not a second verdict.

`groups` follows `run_audit()["groups"]` order. Each entry is `{ "name", "checks", "soft"? }`. `checks` is an array of `id` strings, not nested check objects. `soft` is `true` only on the heads-up group. Every check id appears in exactly one group, and `check.group` equals that group's `name`.

No other keys. The plugin rejects a response that adds or omits required keys, rather than guessing.

### Verdict map

`jd_audit.py` uses `pass`, `needs work`, `couldn't check`, `heads-up`, and `ok`. The JSON verdict is only `pass`, `warn`, `fail`, or `info`.

| `jd_audit.py` verdict | JSON `verdict` | Why |
| --- | --- | --- |
| `pass` | `pass` | Scored check passed. |
| `needs work` | `fail` | Scored check did not pass. The public word on the HTML report is still "Needs work". |
| `couldn't check` | `info` | The check did not measure the page. It is not a pass or a fail. |
| `heads-up` | `warn` | Soft note. `soft_warnings()` does not count these as fails. |
| `ok` | `info` | Soft note that looked fine. It is not part of `passed`. |

### The 21 scored checks

Ids, labels, and groups as `check_mobile`, `check_speed`, `check_seo`, and `check_findability` already name them.

| `id` | `group` | What `source` quotes |
| --- | --- | --- |
| `viewport` | Mobile | The viewport meta content, or `absent`. |
| `zoom` | Mobile | The viewport string that was inspected. |
| `font_size` | Mobile | The px sizes found under 12, or `no font-size under 12px in inline styles or style blocks`. |
| `speed` | Speed | PageSpeed mobile score, LCP, CLS, and TBT when `speed_source` is `pagespeed`. HTML byte size and fetch seconds when `speed_source` is `fallback`. |
| `title` | SEO basics | The title text, or `absent`. |
| `description` | SEO basics | The meta description, or `absent`. |
| `h1` | SEO basics | The first H1 text, or `absent`. |
| `https` | SEO basics | The scheme of `final_url`. |
| `canonical` | SEO basics | The canonical href, or `absent`. |
| `robots` | SEO basics | Whether `robots.txt` was found, and whether `User-agent: *` disallows `/`. |
| `sitemap` | SEO basics | The sitemap URL that contained a urlset or sitemap index, or the candidates that did not. |
| `service_times` | First-time guests | `homepage`, the one-click path, or `not found on the homepage or one click away`. |
| `address` | First-time guests | `homepage` or the one-click path, the city when one was read, and `text` or `schema`. |
| `visit_nav` | First-time guests | The menu label and href, or `not found`. |
| `visit` | First-time guests | The visit, directions, location, or address match, or `not found`. |
| `map` | First-time guests | The map href or iframe src, or `not found`. |
| `tel` | Contact and giving | The `tel:` href, a visible phone number that was not a `tel:` link, or `not found`. |
| `contact` | Contact and giving | Which of phone, email, and street address were present. |
| `give` | Contact and giving | The give or giving-service href, or `not found`. |
| `beliefs` | About and local identity | The beliefs or about label and href, or `not found`. |
| `city` | About and local identity | The city read from the address, and whether it occurred in the title or H1. When no city was read, `source` still says that, and the verdict is `info`. |

### Heads-up notes

`soft_warnings()` may add these. They are checks in the same `checks` array. They are not part of the 21 and they are not part of `passed` or `total`. The group name is `Heads-up (never counted as a fail)` and `soft` is `true`. Omit a note the function did not return. Do not invent one.

| `id` | When it exists | What `source` quotes |
| --- | --- | --- |
| `menu_size` | Header labels were counted. | The count. |
| `labels` | At least one unfamiliar header label was found. | Those labels. |
| `freshness` | A sermon or event date was read. | That date. |

## Errors

The body is always JSON. Do not send an HTML error page. On every error below, omit `checks`. A client must not have to tell a real result from a placeholder.

```json
{
  "error": {
    "code": "bad_url",
    "message": "Only http and https website addresses can be checked."
  }
}
```

### 400 bad URL

`error.code` is `bad_url`. `error.message` is the `UnsafeURLError` string `normalize_url()` or `assert_public_url()` already raises:

- `Enter your church website address.`
- `That address is too long.`
- `Only http and https website addresses can be checked.`
- `That does not look like a website address.`
- `Website addresses with logins cannot be checked.`
- `Only standard web ports can be checked.`
- `That address points to a private network.`
- `We could not find that website. Check the address.`
- `The website redirected to an address we cannot check.`

`source` missing or not `plugin` uses `400` and `error.code` `bad_request`, not `bad_url`.

### 429 rate limit

Same limiter as the HTML form: `RATE_LIMITS` is 5 per hour and 20 per day, per IP. Check the limit before fetching the church site and before calling PageSpeed.

```json
{
  "error": {
    "code": "rate_limited",
    "message": "You have run several audits recently. Please try again in a little while.",
    "limits": { "per_hour": 5, "per_day": 20 }
  }
}
```

A rejected request stores nothing.

### 502 fetch failure

`FetchError` from the existing fetch path. The HTML form currently returns these as `400`. This JSON route returns `502` so a bad address and a site that could not be fetched stay distinct.

`error.code` is `fetch_failed`. `error.message` is the existing sentence:

- `We could not reach that website ({ExceptionName}).`
- `The website sent a redirect with no destination.`
- `The website redirected too many times.`
- `The website answered with an error (HTTP {status}).`

### 500 unexpected failure

Anything else `run_audit()` raises. `error.code` is `audit_failed`. `error.message` is `Something went wrong running the audit. Please try again.`

## Guards to keep

Call the existing helpers. Do not rewrite them.

- `normalize_url()` and `assert_public_url()`: http or https, no username or password, ports 80 and 443 only, public IPs only, no `localhost`, `.local`, or `.internal`.
- `safe_fetch()`: each redirect hop is checked again, at most 5 redirects, response body capped.
- `AuditRateLimiter`: 5 per hour and 20 per day per IP.
- PageSpeed stays inside `run_pagespeed()`. When it does not return a score, `speed_source` is `fallback` and the speed check is the existing estimate. Say that in `finding` and `source`. Do not present the estimate as a Google score.

## Privacy for `source=plugin`

The submitted URL is sent to `journeydigital.ai`, which fetches that page, and the speed check sends the final URL to Google PageSpeed.

Plugin audits store anonymous counts only. On a completed plugin audit, store `passed`, `total`, and `couldnt`. Do not store the submitted URL, the page HTML, an email address, or the client IP. Do not send the submitted URL by text or email.

`POST /audit` is a different route. This contract does not change it, and the plugin does not call it.

Public notes for the plugin:

- Privacy policy: [https://journeydigital.ai/privacy](https://journeydigital.ai/privacy)
- Terms: [https://journeydigital.ai/terms](https://journeydigital.ai/terms)

## What a client may claim

The report is free and complete: every check in `checks` is part of the result. Nothing in the report is withheld pending a purchase.

The report does not promise a search ranking. It does not measure whether service times or the address sit on the first screen of a phone, and it does not measure whether the phone menu is easy to open. Those need a human look. Say only what `finding` and `source` say.
