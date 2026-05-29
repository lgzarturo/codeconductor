---
id: seo-audit
version: 1.0.0
name: SEO Technical Audit
description: >
  Comprehensive technical SEO audit for hotel websites. Checks meta tags, headings,
  internal linking, page speed signals, mobile readiness, crawl directives, and Core Web Vitals
  indicators. Supports --url for single page and --sitemap for batch auditing.

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
    description: Single URL to audit
  - name: sitemap
    type: string
    required: false
    description: Remote sitemap XML URL. Only URLs listed here will be audited.

outputs:
  - name: report
    type: json
    description: Structured SEO audit report

quality:
  reviewed_by: codeconductor-core
  version: 0.3.0
---

# SEO Technical Audit

## Purpose

Perform a comprehensive technical SEO audit on hotel and hospitality websites.
Identify issues that affect search engine visibility, crawlability, and user experience.

## Invocation

```bash
# Single URL
codeconductor seo audit --url https://www.example.com

# Sitemap-scoped (batch)
codeconductor seo audit --sitemap https://www.example.com/sitemap-0.xml

# JSON output
codeconductor seo audit --sitemap https://www.example.com/sitemap-0.xml --format json
```

## Hard Rules

1. **Sitemap-scoped only.** When `--sitemap` is provided, only audit URLs from the sitemap.
2. **No external link following.** Do not crawl links found on pages that are not in the sitemap.
3. **GET only.** All HTTP requests must be GET.
4. **No auth headers.** Never send cookies, auth tokens, or API keys.
5. **Timeout.** 10 seconds per request.
6. **Rate limiting.** 500ms delay between requests. Configurable via `--delay`.
7. **SSRF prevention.** Reject private IP ranges and non-HTTP(S) schemes.

## Audit Checks

### Meta Tags

| Check | Severity | Details |
|-------|----------|---------|
| `<title>` present | FAIL | Every page must have a unique title |
| `<title>` length | WARNING | 50-60 characters optimal |
| `<title>` has brand | SUGGESTION | Hotel name should appear in title |
| `<meta name="description">` present | FAIL | Every page needs a meta description |
| `<meta name="description">` length | WARNING | 150-160 characters optimal |
| `<link rel="canonical">` present | FAIL | Every page must declare its canonical URL |
| Canonical matches URL | WARNING | Canonical should match the actual URL or be intentional |
| `<meta name="robots">` | WARNING | Check for accidental noindex/nofollow |
| `hreflang` tags | WARNING | Hotel sites are often multilingual |

### Open Graph & Social

| Check | Severity | Details |
|-------|----------|---------|
| `og:title` present | WARNING | Required for social sharing |
| `og:description` present | WARNING | Required for social sharing |
| `og:image` present | WARNING | Required for social sharing previews |
| `og:image` dimensions | SUGGESTION | Minimum 1200x630px recommended |
| `og:type` present | SUGGESTION | Should be `website` or specific type |
| `twitter:card` present | SUGGESTION | `summary_large_image` for hotels |

### Content Structure

| Check | Severity | Details |
|-------|----------|---------|
| Single `<h1>` | FAIL | Exactly one H1 per page |
| Heading hierarchy | WARNING | No skipped levels (H1 -> H3) |
| Image alt text | WARNING | Every `<img>` must have alt text |
| Image alt text quality | SUGGESTION | Alt text should be descriptive, not filename |
| Internal links | WARNING | Pages should link to other site pages |
| Content length | WARNING | Thin content (< 300 words) on non-utility pages |

### Technical

| Check | Severity | Details |
|-------|----------|---------|
| HTTPS | FAIL | All pages must use HTTPS |
| Response time | WARNING | Flag pages > 3s response time |
| Content-Type header | WARNING | Must include charset |
| HTML validity | SUGGESTION | Flag obvious HTML errors |
| Viewport meta | FAIL | Required for mobile |
| `lang` attribute | WARNING | `<html lang="...">` must be present |

### Crawl Directives

| Check | Severity | Details |
|-------|----------|---------|
| robots.txt accessible | WARNING | Should be present at /robots.txt |
| Sitemap in robots.txt | SUGGESTION | Sitemap URL should be declared |
| noindex on important pages | FAIL | Hotel pages should be indexable |
| nofollow on internal links | WARNING | Internal links should pass equity |

### Hotel-Specific SEO

| Check | Severity | Details |
|-------|----------|---------|
| Room pages linked from homepage | WARNING | Key pages should be 1-2 clicks from home |
| Booking CTA present | SUGGESTION | Hotel pages should have clear booking paths |
| Location/address visible | WARNING | Important for local SEO |
| Review markup visible | SUGGESTION | Social proof in search results |
| Multi-language support | WARNING | hreflang for international hotels |

## Output Format

### CLI (default)

```text
SEO Audit Report
================
Source: --sitemap https://www.cantovallarta.com/sitemap-0.xml
URLs audited: 24
Timestamp: 2026-05-29T06:40:00Z

--- https://www.cantovallarta.com/ ---
  [FAIL]    Missing <meta name="description">
  [WARNING] Title too long (68 chars, optimal: 50-60)
  [WARNING] Missing hreflang tags
  [PASS]    Canonical URL present
  [PASS]    HTTPS
  [PASS]    Single H1

--- Summary ---
Total URLs:  24
Critical:    3
Warnings:    12
Suggestions: 8
```

## Remediation Guidance

For each FAIL or WARNING, include:

1. **What is wrong** — specific issue
2. **Why it matters** — SEO impact
3. **How to fix** — exact code snippet

### Example

```text
FAIL: Missing <meta name="description"> on /rooms/ocean-suite

Why: Without a meta description, Google auto-generates one from page content.
     This often produces poor snippets that reduce click-through rate.

Fix: Add to <head>:
<meta name="description" content="Ocean Suite at Canto Vallarta — king bed,
  ocean view balcony, and private jacuzzi. Book direct for best rate.">
```
