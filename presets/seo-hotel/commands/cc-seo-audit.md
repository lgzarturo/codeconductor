# SEO Audit

Run a comprehensive SEO and GEO audit on hotel and hospitality websites.

## Usage

```
/cc-seo-audit --url <url> [--format json] [--fail-on error|warning]
/cc-seo-audit --sitemap <sitemap-url> [--format json] [--fail-on error|warning]
/cc-seo-audit --astro --path <src-path>
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--url` | One of `--url` or `--sitemap` | Single URL to audit |
| `--sitemap` | One of `--url` or `--sitemap` | Remote sitemap XML URL. Only URLs listed here will be audited. |
| `--format` | No | Output format: `cli` (default) or `json` |
| `--fail-on` | No | Exit code trigger: `error` (default) or `warning` |
| `--astro` | No | Run Astro-specific SEO validation on source code |
| `--path` | With `--astro` | Path to Astro source directory |
| `--delay` | No | Delay between requests in ms (default: 500) |

## Workflow

1. **Classify** the audit type:
   - `--url` → single page audit
   - `--sitemap` → batch audit, sitemap-scoped only
   - `--astro` → source code validation (no network)

2. **Route** to the appropriate skill(s):
   - Schema validation → `schema-validator` skill
   - Technical SEO → `seo-audit` skill
   - GEO readiness → `geo-readiness` skill
   - Astro source → `astro-seo` skill
   - Off-page strategy → `off-page` skill

3. **Execute** the audit:
   - For `--sitemap`: fetch and parse sitemap XML, extract `<loc>` entries
   - Validate ONLY URLs from the sitemap — never follow external links
   - Apply rate limiting (500ms default between requests)
   - SSRF prevention: reject private IPs and non-HTTP(S) schemes

4. **Report** findings:
   - CLI output with pass/fail/warning per check
   - JSON output for CI/CD integration
   - Remediation guidance with exact code snippets

5. **Exit codes**:
   - `0` = all checks passed
   - `1` = failures found (or warnings if `--fail-on warning`)
   - `2` = warnings only
   - `3` = network or parsing error

## Hard Rules

- **Sitemap-scoped only.** When `--sitemap` is provided, only audit URLs from the sitemap.
- **No external crawling.** Never follow hyperlinks found on pages.
- **GET only.** No POST, PUT, DELETE requests.
- **No auth.** Never send cookies, tokens, or API keys.
- **Timeout.** 10 seconds per request.
- **SSRF prevention.** Reject private IP ranges and non-HTTP(S) schemes.

## Examples

```bash
# Audit a single hotel page
/cc-seo-audit --url https://www.cantovallarta.com

# Batch audit from sitemap
/cc-seo-audit --sitemap https://www.cantovallarta.com/sitemap-0.xml

# CI/CD integration
/cc-seo-audit --sitemap https://preview.example.com/sitemap-0.xml --format json --fail-on error

# Astro source code audit
/cc-seo-audit --astro --path ./src
```

## Skills Loaded

- `schema-validator` — Schema.org structured data validation
- `seo-audit` — Technical SEO checks
- `geo-readiness` — AI-search readiness (GEO)
- `astro-seo` — Astro framework SEO validation
- `off-page` — Off-page SEO strategy guidance
