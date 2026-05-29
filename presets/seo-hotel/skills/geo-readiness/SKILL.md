---
id: geo-readiness
version: 1.0.0
name: GEO Readiness Checker
description: >
  Validates AI-search readiness (Generative Engine Optimization) for hotel websites.
  Checks for citable content, factual cards, llms.txt, structured data completeness,
  and content patterns that AI search engines (ChatGPT, Perplexity, Google AI Overviews)
  use to generate answers about hotels.

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
    description: Single URL to check
  - name: sitemap
    type: string
    required: false
    description: Remote sitemap XML URL. Only URLs listed here will be checked.

outputs:
  - name: report
    type: json
    description: Structured GEO readiness report

quality:
  reviewed_by: codeconductor-core
  version: 0.3.0
---

# GEO Readiness Checker

## Purpose

Evaluate how well a hotel website is positioned for Generative Engine Optimization (GEO) —
the practice of making content easily discoverable, citable, and accurately represented
by AI search engines (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot).

## Invocation

```bash
codeconductor seo geo-readiness --url https://www.example.com
codeconductor seo geo-readiness --sitemap https://www.example.com/sitemap-0.xml
codeconductor seo geo-readiness --sitemap https://www.example.com/sitemap-0.xml --format json
```

## Hard Rules

Same as schema-validator: sitemap-scoped only, no external links, GET only, no auth,
10s timeout, 500ms delay, SSRF prevention.

## GEO Readiness Checks

### llms.txt

| Check | Severity | Details |
|-------|----------|---------|
| `/llms.txt` present | WARNING | Machine-readable site description for AI crawlers |
| `/llms.txt` valid format | FAIL | Must follow llms.txt specification |
| `/llms-full.txt` present | SUGGESTION | Extended version with more detail |
| Content accuracy | WARNING | llms.txt should match actual site content |

### llms.txt expected format

```text
# Canto Vallarta
> Boutique hotel in Puerto Vallarta, Mexico

## Rooms
- Ocean Suite: King bed, ocean view, private jacuzzi
- Garden Room: Queen bed, garden access

## Amenities
- Rooftop pool
- Restaurant
- Spa

## Contact
- Address: [full address]
- Phone: [phone]
- Email: [email]
```

### Citable Content

| Check | Severity | Details |
|-------|----------|---------|
| Factual statements present | WARNING | Pages should contain clear, factual statements AI can cite |
| Structured lists/tables | SUGGESTION | AI engines prefer structured data formats |
| FAQ sections | WARNING | FAQ content is highly citable by AI |
| Unique selling points | WARNING | Clear, concise USPs that AI can extract |
| Pricing information | SUGGESTION | Price ranges help AI answer "how much" queries |
| Location details | WARNING | Address, neighborhood, nearby attractions |

### Content Quality for AI

| Check | Severity | Details |
|-------|----------|---------|
| No contradictory info | FAIL | AI engines penalize conflicting facts |
| Consistent entity naming | WARNING | Use the same hotel name everywhere |
| Date freshness | WARNING | Content with dates should be current |
| Author attribution | SUGGESTION | E-E-A-T signals for AI trust |
| Source citations | SUGGESTION | Linking to authoritative sources boosts AI trust |

### Structured Data Completeness

| Check | Severity | Details |
|-------|----------|---------|
| Schema.org coverage | WARNING | All key entities should have structured data |
| Property completeness | WARNING | Fill optional properties for richer AI citations |
| Cross-references | SUGGESTION | Use `@id` to link related entities |
| SameAs property | WARNING | Link to Wikipedia, Google Maps, TripAdvisor |

### AI Search Specific

| Check | Severity | Details |
|-------|----------|---------|
| Speakable schema | SUGGESTION | `speakable` property for voice search |
| HowTo schema | SUGGESTION | For "how to get to" or "how to book" content |
| TouristAttraction nearby | SUGGESTION | Link to nearby attractions with schema |
| Event schema | SUGGESTION | Hotel events are highly citable |

## Output Format

### CLI (default)

```text
GEO Readiness Report
====================
Source: --url https://www.cantovallarta.com
Timestamp: 2026-05-29T06:40:00Z

llms.txt:
  [WARNING]  /llms.txt not found — AI crawlers lack a machine-readable site summary
  [SUGGEST]  /llms-full.txt not found

Citable Content:
  [PASS]     Factual statements found on /about
  [WARNING]  No FAQ sections detected on any page
  [WARNING]  Missing unique selling points on room pages

Structured Data:
  [WARNING]  Hotel schema missing sameAs property (TripAdvisor, Google Maps)
  [PASS]     BreadcrumbList present

AI Search:
  [SUGGEST]  No speakable schema found
  [SUGGEST]  No HowTo schema for booking process

--- GEO Score ---
Readiness: 45/100
Top actions:
  1. Create /llms.txt with hotel facts
  2. Add FAQ sections to key pages
  3. Add sameAs links to Hotel schema
```

## Remediation

### Create llms.txt

```text
# Canto Vallarta
> Boutique hotel in Puerto Vallarta, Jalisco, Mexico

## About
Canto Vallarta is a 12-room boutique hotel overlooking Banderas Bay.
Founded in 2018. Designed by [architect name].

## Rooms
- [Ocean Suite](/rooms/ocean-suite): King bed, ocean view, $280-450/night
- [Garden Room](/rooms/garden): Queen bed, garden access, $180-280/night

## Amenities
- Rooftop infinity pool (open 7am-10pm)
- Restaurant Canto (breakfast 7-11am, dinner 6-10pm)
- Spa treatments by appointment

## Location
- Address: [full address]
- 15 min from Puerto Vallarta International Airport (PVR)
- 5 min walk from Malecon boardwalk

## Contact
- Phone: +52 322 XXX XXXX
- Email: reservations@cantovallarta.com
- WhatsApp: +52 322 XXX XXXX
```

### Add sameAs to Hotel schema

```json
{
  "@type": "Hotel",
  "name": "Canto Vallarta",
  "sameAs": [
    "https://www.tripadvisor.com/Hotel_Review-...",
    "https://maps.google.com/...",
    "https://www.booking.com/hotel/...",
    "https://www.instagram.com/cantovallarta"
  ]
}
```
