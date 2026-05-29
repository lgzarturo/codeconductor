# Roadmap: SEO Hotel Audit Preset

## Context

CodeConductor v0.2.7 is a multi-agent orchestration framework. The `seo-hotel`
preset extends its capabilities with SEO/GEO auditing for hospitality websites,
while preserving the product philosophy: domain-specific agents built WITH
CodeConductor, not features OF CodeConductor.

This analysis was produced by the multi-perspective Council (Architect,
Security, Product, Delivery, DataOps, Devil) on 2026-05-29.

---

## Multi-Perspective Analysis

### Product — Strategic Fit

**Verdict:** Strategic misalignment with a viable path.

- CodeConductor is an orchestration framework, not an SEO tool.
- There is a risk of diluting the core message (orchestration → SEO tool?).
- SEO auditing requires different tooling (HTTP clients, HTML parsers, DOM
  analysis).
- The success metrics are different (SEO scores vs workflow efficiency).

**Viable angle:** Frame this as domain-specific agents built WITH
CodeConductor. This demonstrates framework versatility without pivoting the
product.

**Differentiator:** AI-powered remediation. The preset should not only detect
issues; it should generate fixes through agents. For example, the implementer
can write corrected JSON-LD, validate that it passes, and produce a deliverable
with a scorecard.

**Feature prioritization:**

| Tier | Feature                | Reason                                             |
| ---- | ---------------------- | -------------------------------------------------- |
| 1    | Schema.org Validator   | Technical, clear acceptance criteria, fills a gap  |
| 2    | Astro SEO Validator    | Plays to framework strengths, less crowded market  |
| 3    | SEO/GEO Audit Suite    | Crowded market, harder to differentiate            |
| 4    | Marketing/SEO Off-Page | Not a core developer-tool concern                  |

### Security — Risks and Mitigations

- SEO agents need **network access** for HTTP requests to external URLs.
  - This breaks the current model where most agents use `network: deny`.
  - **Solution:** Add a dedicated `seo-auditor` agent with `network: allow`
    restricted to GET requests and explicit user-provided URLs.
- SSRF prevention: reject private IP ranges (10.x, 172.16-31.x, 192.168.x,
  127.x, ::1), link-local ranges, localhost aliases, and non-routable hosts.
- Defend against DNS rebinding by resolving hosts before requests and
  re-validating the resolved IP after redirects or retries.
- Validate schemes: allow only `http` and `https`; reject `file:`, `ftp:`,
  `gopher:`, `data:`, `javascript:`, and custom schemes.
- Redirect handling must be disabled by default. If enabled, redirects must stay
  on the same registrable domain unless the user explicitly allows otherwise.
- Apply conservative limits: request timeout, maximum response size, maximum
  sitemap depth, maximum URL count, and per-host rate limiting.
- Never send authentication headers, cookies, API keys, bearer tokens, or
  project secrets to audited URLs.
- Ensure reports do not leak API keys, tokens, preview URLs with secrets, or
  sensitive query parameters.
- Schema.org validation of external URLs must sanitize user input before
  displaying it in terminal, JSON, Markdown, or HTML reports.
- Do not execute JavaScript from parsed HTML. The default crawler should inspect
  static HTML and explicitly report when critical content requires rendering.
- Output sanitization: escape or strip user-controlled HTML that could inject
  scripts into reports.
- Prompt-injection hardening: treat page content, `llms.txt`, metadata, and
  structured data as untrusted input. They may be summarized or analyzed, but
  must never override agent instructions.
- Respect privacy and compliance boundaries. Do not collect booking form data,
  guest information, payment fields, loyalty account content, or authenticated
  pages.
- CI runs must not expose audit artifacts publicly when reports contain staging
  hostnames, unpublished offers, internal URLs, or hotel operational details.
- Dependencies used for HTML parsing, XML parsing, and URL handling must be
  pinned and reviewed because parser bugs can become security issues.

### Delivery — Testing and CI/CD

- Unit tests for each validator (schema parsing, meta tag extraction).
- Integration tests with hotel website fixtures.
- CLI exit codes: `0` = pass, `1` = errors, `2` = warnings only, `3` =
  network/parsing error.
- GitHub Actions integration with `--format json --fail-on error`.

### DataOps — Metrics and Analytics

- Structured JSON output for dashboards.
- Track SEO metrics over time (scores, issue count).
- Benchmark against hospitality competitors.
- Generate shareable HTML reports for non-technical stakeholders.

### Devil's Advocate — Edge Cases and Risks

| Risk                                         | Mitigation                                      |
| -------------------------------------------- | ----------------------------------------------- |
| Scope creep: turning CC into an SEO tool     | Keep this as a preset, not a core feature       |
| SSRF through URL input                       | Scheme allowlist, timeout, no redirects         |
| Heavy dependencies (Puppeteer, Cheerio)      | Evaluate whether fetch + parser is enough in v1 |
| Multilingual hotel sites                     | Design i18n support from the start              |
| External URL rate limiting                   | Configurable, conservative default (500ms)      |
| False positives in Schema.org validation     | Use official specifications, not heuristics     |
| Nested sitemap indexes                       | Max depth: 2 to prevent infinite recursion      |
| Duplicate URLs in sitemaps                   | Deduplicate before validation                   |
| Unexpected redirects                         | Do not follow redirects by default              |
| Booking engines hosted on third-party domains | Audit as a separate explicit target             |
| AI-generated remediation overreach           | Require visible-content parity and scorecards   |

---

## Hospitality SEO and GEO Guidelines

### Hotel SEO Considerations

- Keep the hotel entity consistent across the site: official name, address,
  phone number, brand, property type, amenities, and geo coordinates.
- Maintain NAP consistency across Google Business Profile, Bing Places, Apple
  Business Connect, Tripadvisor, OTAs, local directories, tourism boards, and
  the hotel website.
- Use `Hotel`, `LodgingBusiness`, `HotelRoom`, `Offer`, `AggregateRating`,
  `Review`, `Organization`, `WebSite`, `BreadcrumbList`, and `FAQPage` schema
  only when the same information is visible on the page.
- Do not mark up fake ratings, unavailable prices, unsupported amenities, or
  hidden FAQs.
- Build indexable pages for rooms, suites, dining, spa, events, weddings,
  meetings, local attractions, offers, and destination guides when those pages
  serve real user intent.
- Make booking calls to action crawl-adjacent but avoid hiding important hotel
  facts inside booking widgets, iframes, modals, or client-only flows.
- Use canonical URLs carefully when the booking engine, campaign pages, or OTA
  landing pages generate duplicates.
- Include stable location signals: full street address, neighborhood, city,
  region, country, map link, nearby landmarks, parking information, airport
  distance, and transportation options.
- For multilingual hotel sites, use accurate `hreflang`, translated canonical
  equivalents, localized metadata, and language-specific sitemaps where needed.
- Optimize images with descriptive filenames, meaningful alt text, dimensions,
  responsive sizes, and compression. Room and amenity images should represent
  the actual property.
- Keep offer, package, and seasonal content fresh. Expired offers should return
  a useful alternative, not a thin or misleading page.
- Support E-E-A-T signals: clear ownership, contact information, cancellation
  policy, accessibility information, check-in/check-out details, tax/fee notes,
  editorial review dates, and source-backed destination claims.
- Avoid doorway pages for every micro-location unless each page has unique,
  useful hospitality content.

### GEO and AI-Search Considerations

GEO is treated here as AI-search readiness: making hotel content clear,
citable, current, and machine-readable for systems such as ChatGPT, Perplexity,
Google AI Overviews, and other answer engines.

- Provide a direct summary near the top of each key page: what the hotel is,
  where it is, who it is best for, and what makes it distinct.
- Add factual cards or concise tables for rooms, amenities, dining,
  accessibility, pet policy, parking, fees, airport distance, and neighborhood.
- Make claims verifiable. If the page says "near the beach" or "family
  friendly," include concrete supporting facts.
- Keep entity naming consistent across title tags, headings, schema,
  breadcrumbs, Open Graph metadata, sitemaps, and `llms.txt`.
- Use visible FAQs for questions travelers ask before booking: parking,
  breakfast, airport transfer, pet policy, accessibility, check-in, resort fees,
  cancellation, and local attractions.
- Add update signals for time-sensitive content: `dateModified`, visible "Last
  reviewed" dates, sitemap `<lastmod>`, and validity windows for offers.
- Keep `llms.txt` concise and factual. It should point AI systems to canonical
  pages and must not contain hidden claims that are absent from the website.
- Consider `llms-full.txt` only when it can be generated from accurate,
  maintained, visible site content.
- Separate crawler policies for search indexing, AI-search fetchers,
  user-triggered fetchers, training crawlers, and generic scrapers.
- Do not use hidden prompt instructions, manipulative AI-only content, keyword
  stuffing, or content that asks AI systems to rank or recommend the hotel.
- For destination content, include original editorial criteria, local expertise,
  distances, opening hours freshness, and source notes where appropriate.
- For comparison or recommendation pages, disclose methodology and avoid
  unsupported superiority claims.

---

## Architecture

### Preset Structure

```text
presets/seo-hotel/
├── skills/
│   ├── schema-validator/SKILL.md   — Schema.org (--url + --sitemap)
│   ├── seo-audit/SKILL.md          — Technical SEO audit
│   ├── geo-readiness/SKILL.md      — AI-search readiness (GEO, llms.txt)
│   ├── astro-seo/SKILL.md          — Astro-specific validation
│   └── off-page/SKILL.md           — Off-page and marketing strategy
├── commands/
│   └── cc-seo-audit.md             — OpenCode command
└── agents/                         — Agent contracts (future)

.codeconductor/presets/seo-hotel.yml — Council with 6 SEO agents
```

### SEO Agent Council

| Agent              | Role               | Context       | Focus                                              |
| ------------------ | ------------------ | ------------- | -------------------------------------------------- |
| seo-auditor        | SEO Auditor        | repo-readonly | technical SEO, meta tags, crawlability, page speed |
| schema-validator   | Schema Validator   | repo-readonly | schema.org, JSON-LD, structured data, rich results |
| geo-specialist     | GEO Specialist     | repo-readonly | AI search, citable content, llms.txt               |
| content-strategist | Content Strategist | prompt-only   | content marketing, off-page SEO, backlinks         |
| astro-specialist   | Astro Specialist   | repo-readonly | Astro framework, static generation, islands        |
| devil              | Devil              | repo-readonly | edge cases, SSRF prevention, failure modes         |

### Core Integration

- Registered in `src/core/presets/preset-registry.ts`.
- SEO agents added to `src/domain/council/council-spec.ts` as
  `SEO_HOTEL_COUNCIL_AGENTS`.
- Responsibilities added in `src/domain/council/council-agent.ts`.
- `ROADMAP.md` updated with completed items.

---

## Implemented Skills

### 1. Schema.org Validator (`schema-validator`)

**Purpose:** Validate structured data (JSON-LD, Microdata, RDFa) on hotel
websites.

**Invocation:**

```bash
codeconductor seo validate-schema --url https://www.example.com
codeconductor seo validate-schema --sitemap https://www.example.com/sitemap-0.xml
codeconductor seo validate-schema --sitemap https://www.example.com/sitemap-0.xml --format json
codeconductor seo validate-schema --sitemap https://www.example.com/sitemap-0.xml --fail-on error
```

**Supported schema types:**

Hotel and hospitality primary types:

- `Hotel`, `LodgingBusiness`, `HotelRoom`, `LocalBusiness`, `Resort`

Supporting types:

- `BreadcrumbList`, `FAQPage`, `Review`, `AggregateRating`, `Organization`,
  `WebSite`, `ImageObject`, `Offer`, `Place`

**Sitemap parsing:**

- Standard XML Sitemap (`<urlset>` with `<loc>`).
- Sitemap Index (`<sitemapindex>` with nested `<sitemap><loc>`).
- Max depth: 2 for nested sitemaps.
- URL deduplication.
- Filter: only HTTP/HTTPS URLs from the same domain.

**Hard rules:**

1. Sitemap-scoped only — only URLs from the sitemap, never external link
   crawling.
2. GET only — no POST, PUT, DELETE.
3. No auth headers — no cookies, tokens, or API keys.
4. Timeout: 10s per request.
5. Rate limiting: 500ms between requests, configurable via `--delay`.
6. SSRF prevention — reject private IP ranges and non-HTTP(S) schemes.
7. No redirects by default; use `--follow-redirects` to enable them.
8. Response size limit to prevent memory exhaustion.
9. User-controlled report content must be escaped.

**Exit codes:**

| Code | Meaning                  |
| ---- | ------------------------ |
| 0    | All URLs passed          |
| 1    | At least one FAIL        |
| 2    | Warnings only            |
| 3    | Network or parsing error |

### 2. SEO Technical Audit (`seo-audit`)

**Purpose:** Comprehensive technical SEO audit.

**Implemented checks:**

- Meta tags (title, description, canonical, robots, hreflang).
- Open Graph and social (og:title, og:description, og:image, twitter:card).
- Content structure (single H1, heading hierarchy, alt text, internal links).
- Technical checks (HTTPS, response time, viewport, lang attribute).
- Crawl directives (robots.txt, noindex, nofollow).
- Hotel-specific checks (room pages linked, booking CTA, visible location,
  multilingual coverage).

### 3. GEO Readiness Checker (`geo-readiness`)

**Purpose:** Validate AI-search readiness for ChatGPT, Perplexity, Google AI
Overviews, and similar answer engines.

**Implemented checks:**

- `llms.txt` and `llms-full.txt` (presence, format, accuracy).
- Citable content (factual statements, structured lists, FAQ sections, USPs).
- Content quality (contradictions, entity naming consistency, freshness dates).
- Structured data completeness (coverage, property completeness, sameAs).
- AI-search specific checks (`speakable`, `HowTo`, `TouristAttraction`, `Event`
  schema where relevant and visible).

### 4. Astro SEO Validator (`astro-seo`)

**Purpose:** SEO validation specific to Astro projects.

**Implemented checks:**

- Astro configuration (site, output mode, sitemap integration, image
  optimization).
- Meta tags through Astro components (recommended layout pattern).
- Content Collections (schema with SEO fields, draft exclusion).
- Islands Architecture SEO (critical content is static, correct `client:*`
  directives).
- Image optimization (`Image` component, width/height, alt text, responsive
  sizes).
- Sitemap (integration, custom serialization, dynamic routes, lastmod).
- Performance (hydration directives, view transitions).

### 5. Off-Page and Marketing (`off-page`)

**Purpose:** Strategic off-page SEO guidance for hotels.

**Content:**

- Hotel citation sources (Google Business Profile, Tripadvisor, OTAs).
- NAP consistency (Name, Address, Phone).
- Backlink strategy (tourism boards, travel bloggers, local directories).
- Link-worthy content types (destination guides, event calendars, itineraries).
- Schema markup for off-page signals (`sameAs`, `AggregateRating`).
- Content marketing templates (blog post structure, FAQ schema).
- Social signals (platform-specific guidance).

---

## Implementation Roadmap

### v0.3.0 — Schema.org Validator (Completed)

- [x] `schema-validator` skill with `--url` and `--sitemap` support.
- [x] Sitemap parsing (urlset + sitemapindex, deduplication, same-domain
      filter).
- [x] Hotel and hospitality schema type validation.
- [x] CLI + JSON output.
- [x] Exit codes for CI/CD.
- [x] SSRF prevention.
- [x] Configurable rate limiting.
- [x] Remediation guidance with exact code snippets.
- [x] `seo-hotel.yml` Council with 6 agents.
- [x] `cc-seo-audit.md` command.
- [x] Registration in `preset-registry.ts`.

### v0.3.1 — SEO Technical Audit (Completed)

- [x] `seo-audit` skill with meta tag, OG, content, technical, and crawl
      checks.
- [x] Hotel-specific SEO checks.
- [x] CLI + JSON output.

### v0.3.2 — GEO Readiness (Completed)

- [x] `geo-readiness` skill with checks for `llms.txt`, citable content, and
      structured data.
- [x] AI-search specific checks.
- [x] GEO score calculation.

### v0.3.3 — Astro SEO (Completed)

- [x] `astro-seo` skill with checks for config, metadata, collections, islands,
      images, and sitemap.
- [x] Recommended patterns (layout, content collection schema, sitemap
      customization).

### v0.3.4 — Off-Page Strategy (Completed)

- [x] `off-page` skill with citation sources, backlink strategy, and content
      templates.
- [x] Hotel-specific guidance (NAP, review schema, social signals).

### v0.4.0 — CLI Implementation (Pending)

- [ ] Implement `codeconductor seo validate-schema` as a real CLI command.
- [ ] HTTP client with SSRF prevention.
- [ ] Sitemap XML parser.
- [ ] JSON-LD extractor from `<script type="application/ld+json">`.
- [ ] Microdata extractor (`itemscope`, `itemtype`, `itemprop`).
- [ ] Schema.org property validator by type.
- [ ] CLI output formatter (colored terminal).
- [ ] JSON output formatter.
- [ ] Exit code logic.
- [ ] Unit tests for each component.
- [ ] Integration tests with hotel website fixtures.
- [ ] Security tests for SSRF, redirects, oversized responses, and report
      sanitization.

### v0.5.0 — AI-Powered Remediation (Pending)

- [ ] Detect issue → generate Task Card → route to implementer.
- [ ] Implementer writes the fix (JSON-LD, meta tags, etc.).
- [ ] Validate that the fix passes the schema validator.
- [ ] Produce deliverable with scorecard.
- [ ] End-to-end flow: detection → remediation → validation.
- [ ] Guard remediation against unsupported claims and hidden structured data.

### v0.6.0+ — Expansion (Pending)

- [ ] Hotel industry benchmarks (compare against competitors).
- [ ] Multi-language support (hotel sites are often multilingual).
- [ ] Core Web Vitals integration (Lighthouse API).
- [ ] HTML report generator for non-technical stakeholders.
- [ ] Historical tracking of SEO metrics.
- [ ] AI-search citation tracking where reliable data is available.
- [ ] Booking-engine audit mode for explicitly approved third-party domains.

---

## CI/CD Integration

### GitHub Actions

```yaml
name: SEO Audit
on: [pull_request]

jobs:
  seo-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate Schema.org
        run: |
          codeconductor seo validate-schema \
            --sitemap https://preview-${{ github.event.pull_request.number }}.example.com/sitemap-0.xml \
            --format json \
            --fail-on error \
            --output schema-report.json

      - name: SEO Technical Audit
        run: |
          codeconductor seo audit \
            --sitemap https://preview-${{ github.event.pull_request.number }}.example.com/sitemap-0.xml \
            --format json \
            --fail-on warning \
            --output seo-report.json

      - name: GEO Readiness
        run: |
          codeconductor seo geo-readiness \
            --url https://preview-${{ github.event.pull_request.number }}.example.com \
            --format json

      - name: Astro SEO (source)
        run: |
          codeconductor seo audit-astro \
            --path ./src \
            --format json
```

---

## Key Validation Metric

Track whether users adopt CodeConductor **because of** the SEO capabilities
(pivot signal) or use SEO agents **as part of** broader development workflows
(framework validation).

The second scenario is preferred: SEO agents demonstrate the versatility of the
orchestration framework, not an independent SEO product.

---

## Relevant Files

| File                                                 | Description                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| `presets/seo-hotel/skills/schema-validator/SKILL.md` | Schema.org validator with --url and --sitemap    |
| `presets/seo-hotel/skills/seo-audit/SKILL.md`        | Technical SEO audit                              |
| `presets/seo-hotel/skills/geo-readiness/SKILL.md`    | GEO readiness (AI search)                        |
| `presets/seo-hotel/skills/astro-seo/SKILL.md`        | Astro-specific SEO validation                    |
| `presets/seo-hotel/skills/off-page/SKILL.md`         | Off-page SEO strategy                            |
| `presets/seo-hotel/commands/cc-seo-audit.md`         | OpenCode command                                 |
| `.codeconductor/presets/seo-hotel.yml`               | Council YAML with 6 SEO agents                   |
| `src/core/presets/preset-registry.ts`                | Registration for the `seo-hotel` preset          |
| `src/domain/council/council-spec.ts`                 | Added `SEO_HOTEL_COUNCIL_AGENTS`                 |
| `src/domain/council/council-agent.ts`                | Responsibilities for SEO agents                  |
| `ROADMAP.md`                                         | Astro and SEO items marked as completed          |
