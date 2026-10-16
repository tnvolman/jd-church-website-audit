# Church website audit JSON endpoint

Live contract for `POST /api/audit`. The HTML form at [https://journeydigital.ai/audit](https://journeydigital.ai/audit) stays a separate page. This document does not change how a check is scored.

Scoring already lives in `tnvolman/the-forge` `src/routes/jd_audit.py`, function `run_audit()`. `report_to_json()` serializes that return value. It does not copy the thresholds, the HTML parser, or the check functions into a second implementation.

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

Send `include_cta` only to change the default. `false` drops `cta`. Any other value, including omitting the field, keeps `cta`.

```json
{ "url": "https://example.org", "source": "plugin", "include_cta": false }
```

| Input | Rule |
| --- | --- |
| `url` | Required string. The church address as submitted. `normalize_url()` in `jd_audit.py` already accepts a host without a scheme. |
| `source` | The query parameter and the JSON field are both the exact string `plugin`. The plugin sends both on every request. |
| `include_cta` | Optional boolean. `false` omits `cta`. The plugin sends it only when the tool argument is set. |

This route does not take an email address. An empty `url` is `400` with `error` `bad_url` and `message` `Send JSON like {"url": "yourchurch.org", "source": "plugin"}.`

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
  "groups": [
    { "name": "Mobile", "soft": false, "ids": ["viewport", "zoom", "font_size"] }
  ],
  "checks": [
    {
      "id": "viewport",
      "group": "Mobile",
      "verdict": "pass",
      "finding": "The page has a viewport tag that tells phones to fit it to the screen, which is what Lighthouse's viewport audit checks for.",
      "source": "homepage_html",
      "label": "Mobile viewport tag"
    }
  ],
  "citations": {
    "viewport": {
      "name": "Lighthouse: viewport audit",
      "url": "https://developer.chrome.com/docs/lighthouse/pwa/viewport"
    }
  },
  "disclaimer": "Automated checks of one public homepage, read from its HTML plus Google PageSpeed Insights when available. They can miss things a person would catch, \"couldn't check\" means the HTML didn't show enough to judge, and passing them does not guarantee any search ranking.",
  "cta": {
    "text": "Want a second pair of eyes? Journey Digital, a small, owner-run church web studio, offers a free consultation.",
    "url": "https://journeydigital.ai/#contact",
    "email": "sales@journeydigital.ai"
  }
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
| `source` | The channel `_check_source()` names. Not a second verdict. |
| `label` | The existing `label`. |

`source` is one of three strings from `_check_source()`:

| `source` | When |
| --- | --- |
| `homepage_html` | Every check except speed, robots, and sitemap. |
| `google_pagespeed` | `speed`, when `speed_source` is `pagespeed`. |
| `estimate` | `speed`, when `speed_source` is `fallback`. |
| `robots_sitemap_fetch` | `robots` and `sitemap`. |

The plain-English measurement stays in `finding`. `source` names where that measurement came from. Cite it exactly.

`groups` follows `run_audit()["groups"]` order. Each entry is `{ "name", "soft", "ids" }`. `ids` is an array of check id strings, not nested check objects. `soft` is a boolean, `true` only on the heads-up group. Every check id appears in exactly one group, and `check.group` equals that group's `name`.

`citations` is an object from `CITATIONS`, limited to ids present in this report whose citation is not `None`. `h1` and `give` have no citation. Each value is `{ "name", "url" }`.

`disclaimer` is the fixed string from `API_DISCLAIMER`.

`cta` is present unless `include_cta` is `false`. It is `{ "text", "url", "email" }` with `url` `https://journeydigital.ai/#contact` and `email` `sales@journeydigital.ai`.

The plugin passes these fields through. It still rejects a report that omits a required check field or uses a verdict outside `pass`, `warn`, `fail`, and `info`.

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

| `id` | `group` | `source` |
| --- | --- | --- |
| `viewport` | Mobile | `homepage_html` |
| `zoom` | Mobile | `homepage_html` |
| `font_size` | Mobile | `homepage_html` |
| `speed` | Speed | `google_pagespeed` or `estimate` |
| `title` | SEO basics | `homepage_html` |
| `description` | SEO basics | `homepage_html` |
| `h1` | SEO basics | `homepage_html` |
| `https` | SEO basics | `homepage_html` |
| `canonical` | SEO basics | `homepage_html` |
| `robots` | SEO basics | `robots_sitemap_fetch` |
| `sitemap` | SEO basics | `robots_sitemap_fetch` |
| `service_times` | First-time guests | `homepage_html` |
| `address` | First-time guests | `homepage_html` |
| `visit_nav` | First-time guests | `homepage_html` |
| `visit` | First-time guests | `homepage_html` |
| `map` | First-time guests | `homepage_html` |
| `tel` | Contact and giving | `homepage_html` |
| `contact` | Contact and giving | `homepage_html` |
| `give` | Contact and giving | `homepage_html` |
| `beliefs` | About and local identity | `homepage_html` |
| `city` | About and local identity | `homepage_html` |

### Heads-up notes

`soft_warnings()` may add these. They are checks in the same `checks` array. They are not part of the 21 and they are not part of `passed` or `total`. The group name is `Heads-up (never counted as a fail)` and `soft` is `true`. Omit a note the function did not return. Do not invent one.

| `id` | When it exists | `source` |
| --- | --- | --- |
| `menu_size` | Header labels were counted. | `homepage_html` |
| `labels` | At least one unfamiliar header label was found. | `homepage_html` |
| `freshness` | A sermon or event date was read. | `homepage_html` |

## Errors

The body is always JSON. Do not send an HTML error page. On every error below, omit `checks`. A client must not have to tell a real result from a placeholder.

```json
{
  "error": "bad_url",
  "message": "Only http and https website addresses can be checked."
}
```

### 400 bad URL

`error` is `bad_url`. `message` is the `UnsafeURLError` string `normalize_url()` or `assert_public_url()` already raises:

- `Enter your church website address.`
- `That address is too long.`
- `Only http and https website addresses can be checked.`
- `That does not look like a website address.`
- `Website addresses with logins cannot be checked.`
- `Only standard web ports can be checked.`
- `That address points to a private network.`
- `We could not find that website. Check the address.`
- `The website redirected to an address we cannot check.`

### 429 rate limit

Same limiter as the HTML form: `RATE_LIMITS` is 5 per hour and 20 per day, per IP, keyed as `api:` plus the client IP. Check the limit before fetching the church site and before calling PageSpeed.

```json
{
  "error": "rate_limited",
  "message": "Too many audits from this address. Please try again later."
}
```

A rejected request stores nothing.

### 502 fetch failure

`FetchError` from the existing fetch path. The HTML form currently returns these as `400`. This JSON route returns `502` so a bad address and a site that could not be fetched stay distinct.

`error` is `fetch_failed`. `message` is the existing sentence:

- `We could not reach that website ({ExceptionName}).`
- `The website sent a redirect with no destination.`
- `The website redirected too many times.`
- `The website answered with an error (HTTP {status}).`

### 500 unexpected failure

Anything else `run_audit()` raises. `error` is `internal`. `message` is `Something went wrong running the audit.`

## Guards to keep

Call the existing helpers. Do not rewrite them.

- `normalize_url()` and `assert_public_url()`: http or https, no username or password, ports 80 and 443 only, public IPs only, no `localhost`, `.local`, or `.internal`.
- `safe_fetch()`: each redirect hop is checked again, at most 5 redirects, response body capped.
- `AuditRateLimiter`: 5 per hour and 20 per day per IP.
- PageSpeed stays inside `run_pagespeed()`. When it does not return a score, `speed_source` is `fallback`, the speed `source` is `estimate`, and `finding` is the existing estimate. Do not present the estimate as a Google score.

## Privacy for `source=plugin`

The submitted URL is sent to `journeydigital.ai`, which fetches that page, and the speed check sends the final URL to Google PageSpeed.

Plugin audits store anonymous counts only. On a completed plugin audit, store `passed`, `total`, and `couldnt`. Do not store the submitted URL, the page HTML, an email address, or the client IP. Do not send the submitted URL by text or email.

`POST /audit` is a different route. This contract does not change it, and the plugin does not call it.

Public notes for the plugin:

- Privacy policy: [https://journeydigital.ai/privacy](https://journeydigital.ai/privacy)
- Terms: [https://journeydigital.ai/terms](https://journeydigital.ai/terms)

## What a client may claim

The report is free and complete: every check in `checks` is part of the result. Nothing in the report is withheld pending a purchase. Show `disclaimer` and, when it is present, `cta` as returned. `cta.url` is [https://journeydigital.ai/#contact](https://journeydigital.ai/#contact).

The report does not promise a search ranking. It does not measure whether service times or the address sit on the first screen of a phone, and it does not measure whether the phone menu is easy to open. Those need a human look. Say only what `finding`, `source`, and `disclaimer` say.
