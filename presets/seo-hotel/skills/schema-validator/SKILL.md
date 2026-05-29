---
id: schema-validator
version: 1.0.0
name: Schema.org Validator
description: >
  Validates Schema.org structured data (JSON-LD, Microdata, RDFa) on hotel and hospitality websites.
  Supports single URL validation via --url and sitemap-scoped batch validation via --sitemap.
  Only crawls URLs explicitly listed in the sitemap — never follows external links.

user-invokable: true
license: MIT
metadata:
  author: codeconductor
  category: seo

compatibility:
  tools: [claude, codex, gemini, opencode]
  stacks:
    languages: []
    frameworks: [astro, nextjs, django, spring]

risk:
  level: medium
  can_execute_shell: true
  can_modify_files: false
  requires_network: true

inputs:
  - name: url
    type: string
    required: false
    description: Single URL to validate
  - name: sitemap
    type: string
    required: false
    description: Remote sitemap XML URL. Only URLs listed here will be crawled.

outputs:
  - name: report
    type: json
    description: Structured validation report with pass/fail/warning per schema type

quality:
  reviewed_by: codeconductor-core
  version: 0.3.0
---

# Schema.org Validator

## Purpose

Validate Schema.org structured data on hotel and hospitality websites. Detect missing,
invalid, or incomplete markup and generate actionable remediation guidance.

## Invocation

```bash
# Single URL
codeconductor seo validate-schema --url https://www.example.com

# Sitemap-scoped (batch)
codeconductor seo validate-schema --sitemap https://www.example.com/sitemap-0.xml

# JSON output for CI/CD
codeconductor seo validate-schema --sitemap https://www.example.com/sitemap-0.xml --format json

# Fail on errors (CI/CD exit code)
codeconductor seo validate-schema --sitemap https://www.example.com/sitemap-0.xml --fail-on error
```

## Hard Rules

1. **Sitemap-scoped only.** When `--sitemap` is provided, fetch the XML, extract `<loc>` entries,
   and validate ONLY those URLs. Never follow hyperlinks found on those pages.
2. **No external crawling.** URLs not present in the sitemap are excluded. Period.
3. **GET only.** All HTTP requests must be GET. No POST, PUT, DELETE.
4. **No auth headers.** Never send cookies, auth tokens, or API keys in requests.
5. **Timeout.** Each HTTP request must timeout after 10 seconds.
6. **Rate limiting.** Default 500ms delay between requests. Configurable via `--delay`.
7. **SSRF prevention.** Reject URLs with private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1).
   Reject non-HTTP(S) schemes.
8. **No redirects by default.** Do not follow HTTP redirects unless `--follow-redirects` is passed.

## Sitemap Parsing

### Supported formats

- Standard XML Sitemap (`<urlset>` with `<loc>` entries)
- Sitemap Index (`<sitemapindex>` with nested `<sitemap><loc>` entries)

### Parsing rules

1. Fetch the sitemap URL via GET
2. Parse XML response
3. If `<sitemapindex>`, recursively fetch each child sitemap (max depth: 2)
4. Extract all `<loc>` values
5. Deduplicate URLs
6. Filter: only HTTP/HTTPS URLs
7. Filter: only URLs on the same domain as the sitemap origin
8. Return the final URL list

### Example sitemap fetch

```text
GET https://www.cantovallarta.com/sitemap-0.xml
  -> Parse <urlset>
  -> Extract: [
       https://www.cantovallarta.com/,
       https://www.cantovallarta.com/rooms,
       https://www.cantovallarta.com/rooms/ocean-suite,
       https://www.cantovallarta.com/dining,
       ...
     ]
  -> Validate each URL's structured data
```

## Schema Types to Validate

### Hotel & Hospitality (primary)

| Schema Type | Required Properties | Common Issues |
|------------|-------------------|---------------|
| `Hotel` | name, address, starRating, image | Missing starRating, incomplete address |
| `LodgingBusiness` | name, address, checkinTime, checkoutTime | Missing check-in/out times |
| `HotelRoom` | name, occupancy, bed | Missing occupancy details |
| `LocalBusiness` | name, address, telephone, openingHours | Missing telephone or hours |
| `Resort` | name, address, amenityFeature | Missing amenities |

### Supporting Types (secondary)

| Schema Type | Required Properties | Common Issues |
|------------|-------------------|---------------|
| `BreadcrumbList` | itemListElement (with position, name, item) | Missing position, broken item URLs |
| `FAQPage` | mainEntity (Question + acceptedAnswer) | Missing acceptedAnswer |
| `Review` | author, reviewBody, reviewRating | Missing author or rating |
| `AggregateRating` | ratingValue, reviewCount, bestRating | Missing reviewCount |
| `Organization` | name, url, logo | Missing logo |
| `WebSite` | name, url, potentialAction (SearchAction) | Missing SearchAction |
| `ImageObject` | contentUrl, caption | Missing caption for accessibility |

### Hotel-specific checks

- `starRating` must be 1-5
- `priceRange` should use standard format (e.g., "$$", "$$$")
- `address` must include `addressCountry` for international hotels
- `geo` coordinates should be present and within valid ranges
- `amenityFeature` should use `LocationFeatureSpecification` with proper `name` values
- `image` must be absolute URLs, not relative paths

## Validation Logic

### Per URL

1. Fetch the page HTML via GET
2. Extract all `<script type="application/ld+json">` blocks (JSON-LD)
3. Extract Microdata attributes (`itemscope`, `itemtype`, `itemprop`)
4. For each structured data block:
   a. Parse JSON (for JSON-LD)
   b. Identify `@type`
   c. Validate required properties for that type
   d. Validate property value formats
   e. Check for common anti-patterns
5. Score: PASS / WARNING / FAIL per type
6. Aggregate into URL-level score

### Scoring

| Status | Meaning |
|--------|---------|
| PASS | All required properties present and valid |
| WARNING | Optional properties missing or suboptimal |
| FAIL | Required properties missing or invalid |
| NONE | No structured data found for this type |

### Anti-patterns to detect

- Duplicate `@type` on same page (e.g., two `Hotel` blocks)
- `@context` not set to `https://schema.org`
- Nested types without proper `@id` references
- Empty string values instead of omitting optional properties
- `description` that is identical to `name`
- Images without `width` and `height` (affects CLS and rich results)

## Output Format

### CLI (default)

```text
Schema.org Validation Report
============================
Source: --sitemap https://www.cantovallarta.com/sitemap-0.xml
URLs validated: 24
Timestamp: 2026-05-29T06:40:00Z

--- https://www.cantovallarta.com/ ---
  Hotel:              PASS
  BreadcrumbList:     WARNING — missing position on item 2
  Organization:       PASS
  WebSite:            FAIL — missing potentialAction (SearchAction)

--- https://www.cantovallarta.com/rooms/ocean-suite ---
  HotelRoom:          PASS
  AggregateRating:    WARNING — missing reviewCount
  BreadcrumbList:     PASS
  Review:             NONE — no review markup found

--- Summary ---
Total URLs:    24
PASS:          18 (75%)
WARNING:       4  (17%)
FAIL:          2  (8%)
```

### JSON (--format json)

```json
{
  "source": "https://www.cantovallarta.com/sitemap-0.xml",
  "timestamp": "2026-05-29T06:40:00Z",
  "urlsValidated": 24,
  "results": [
    {
      "url": "https://www.cantovallarta.com/",
      "schemas": [
        {
          "type": "Hotel",
          "status": "pass",
          "issues": []
        },
        {
          "type": "BreadcrumbList",
          "status": "warning",
          "issues": [
            {
              "severity": "warning",
              "message": "missing position on item 2",
              "property": "itemListElement[1].position",
              "fix": "Add \"position\": 2 to the second breadcrumb item"
            }
          ]
        }
      ]
    }
  ],
  "summary": {
    "total": 24,
    "pass": 18,
    "warning": 4,
    "fail": 2
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All URLs passed (no FAIL) |
| 1 | At least one FAIL found |
| 2 | Warnings only, no FAIL |
| 3 | Network or parsing error |

Use `--fail-on error` to exit 1 only on FAIL, or `--fail-on warning` to exit 1 on WARNING or FAIL.

## Remediation Guidance

For each FAIL or WARNING, the report must include:

1. **What is wrong** — the specific missing or invalid property
2. **Why it matters** — impact on rich results, AI search, or SEO ranking
3. **How to fix** — exact JSON-LD snippet to add or correct

### Example remediation

```text
FAIL: WebSite missing potentialAction (SearchAction)

Why: Google uses SearchAction to display a sitelinks search box in SERPs.
     Without it, your homepage misses this enhanced result.

Fix: Add this to your WebSite JSON-LD:

{
  "@type": "WebSite",
  "name": "Canto Vallarta",
  "url": "https://www.cantovallarta.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://www.cantovallarta.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Validate Schema.org
  run: |
    codeconductor seo validate-schema \
      --sitemap https://preview-${{ github.event.pull_request.number }}.example.com/sitemap-0.xml \
      --format json \
      --fail-on error \
      --output schema-report.json

- name: Comment PR with results
  if: failure()
  uses: actions/github-script@v7
  with:
    script: |
      const report = require('./schema-report.json');
      const fails = report.results.filter(r => r.schemas.some(s => s.status === 'fail'));
      // ... format and post comment
```

## Security Constraints

- **Network access**: Required, but restricted to GET requests on explicitly provided URLs
- **No credentials**: Never send auth headers, cookies, or API keys
- **SSRF prevention**: Reject private IP ranges and non-HTTP(S) schemes
- **Input sanitization**: URL parameters must be validated as proper URLs before fetching
- **No DOM execution**: Parse HTML as text, do not execute JavaScript (prevents XSS in audit reports)
- **Output sanitization**: Strip any user-controlled content from reports that could contain XSS payloads
