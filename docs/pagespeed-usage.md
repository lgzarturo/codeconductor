# PageSpeed Performance Audit — Usage Guide

The `cc-pagespeed` command integrates the **PageSpeed Insights API (PSI v5)** into
the CodeConductor workflow. It applies the 80/20 principle to identify the 20%
of changes that produce 80% of the performance gain, and produces a prioritized
report with quantified estimates and framework-specific implementation code.

---

## Quick Start

```bash
# Inside Claude Code or OpenCode
/cc-pagespeed --url https://www.example.com
```

No installation required. The command is available after running:

```bash
npx cc-codeconductor install preset --target claude   # for Claude Code
npx cc-codeconductor install preset --target opencode # for OpenCode
npx cc-codeconductor install preset --target all      # for all runners
```

---

## `PAGESPEED_API_KEY` — Setup and Why It Matters

### What requires the key

| Feature                          | Without key | With key |
| -------------------------------- | ----------- | -------- |
| Lighthouse lab metrics (LCP, TBT, CLS, FCP) | ✅ | ✅ |
| Lighthouse opportunities (JS/CSS savings)   | ✅ | ✅ |
| CrUX field data (real user LCP, INP, CLS)   | ❌ | ✅ |
| `overall_category` (FAST/AVERAGE/SLOW)       | ❌ | ✅ |
| API rate limit                               | ~2 req/s shared | 25,000/day |

**CrUX field data** is the most valuable difference. It reflects real user
experience from the Chrome User Experience Report — not a simulated Lighthouse
run. Without it, you cannot know whether your actual users see acceptable
performance or not.

### How to get a free API key

1. Go to <https://developers.google.com/speed/docs/insights/v5/get-started>
2. Click **Get a Key**.
3. Sign in with a Google account.
4. Create or select a Google Cloud project.
5. Copy the generated key.

The key is free and provides 25,000 requests per day, which is sufficient for
any manual or CI/CD use.

### How to set the key

**Windows PowerShell (current session):**
```powershell
$env:PAGESPEED_API_KEY = "AIza..."
```

**Windows PowerShell (permanent — user profile):**
```powershell
[System.Environment]::SetEnvironmentVariable("PAGESPEED_API_KEY", "AIza...", "User")
```

**macOS / Linux (current session):**
```bash
export PAGESPEED_API_KEY="AIza..."
```

**macOS / Linux (permanent — `~/.zshrc` or `~/.bashrc`):**
```bash
echo 'export PAGESPEED_API_KEY="AIza..."' >> ~/.zshrc
source ~/.zshrc
```

**Verify the key is set:**
```powershell
# PowerShell
$env:PAGESPEED_API_KEY

# bash
echo $PAGESPEED_API_KEY
```

---

## Usage

### Basic audit (mobile + desktop)

```bash
/cc-pagespeed --url https://www.example.com
```

### Mobile only

```bash
/cc-pagespeed --url https://www.example.com --strategy mobile
```

### Desktop only

```bash
/cc-pagespeed --url https://www.example.com --strategy desktop
```

---

## How It Works

The command executes the `pagespeed-perf` skill in five steps:

### 1. Pre-flight

Reads `PAGESPEED_API_KEY` from the environment. Computes the output filename:
`{YYYY-MM-DD}_pagespeed-{hostname}-claude.md`.

### 2. Collect

Calls the PSI API for mobile and/or desktop strategy. If
[Bun](https://bun.sh) is available and the skill scripts are installed at
`~/.claude/skills/pagespeed-perf/scripts/`, the command uses the optimized
TypeScript scripts (`run.ts`, `psi-collect.ts`, `html-audit.ts`) that run in
parallel and return structured JSON.

If Bun is unavailable, the command falls back to direct `WebFetch` calls to the
PSI endpoint and manual HTML inspection.

### 3. Analyze

Extracts from the PSI response:

- **Core Web Vitals**: LCP, INP, CLS, FCP, TBT, TTFB (lab and field)
- **LCP element**: type (image, text, video), HTML snippet
- **Third-party scripts**: origin, blocking time, transfer size
- **Render-blocking resources**: savings in ms
- **Unused JavaScript/CSS**: savings in bytes

Extracts from the HTML source:

- Resource hints: `<link rel="preload|preconnect|prefetch">`
- Images: format (WebP?), lazy loading, `fetchpriority`, explicit dimensions
- Fonts: `font-display`, preloaded subsets
- Blocking scripts in `<head>` (without `async`/`defer`)

### 4. Prioritize (80/20 matrix)

Scores each optimization: `Impact (1–5) × Ease (1–5)`. Orders findings
by descending score. The **Critical 20%** (Score ≥ 20) are:

| Score | Optimization                              |
| ----- | ----------------------------------------- |
| 25    | Preload LCP element + `fetchpriority`     |
| 25    | Gzip / Brotli server compression          |
| 20    | WebP images with explicit dimensions      |
| 20    | Lazy loading of offscreen images          |
| 20    | `font-display: swap` for all fonts        |
| 20    | `preconnect` to critical origins          |
| 20    | Defer / facade all third-party scripts    |

### 5. Report

Writes the report to `{YYYY-MM-DD}_pagespeed-{hostname}-claude.md` in the
current working directory.

---

## Output File

### Naming

| URL                          | Output file                                       |
| ---------------------------- | ------------------------------------------------- |
| `https://example.com`        | `2026-06-07_pagespeed-example-com-claude.md`      |
| `https://www.tienda.mx/ropa` | `2026-06-07_pagespeed-www-tienda-mx-claude.md`   |
| `https://app.empresa.io`     | `2026-06-07_pagespeed-app-empresa-io-claude.md`  |

### Report sections

1. **Resumen Ejecutivo** — 2–3 paragraphs: current state, score, main bottleneck,
   improvement potential.
2. **Métricas Actuales** — Lab (Lighthouse) vs Field (CrUX) comparison table.
3. **Recursos con Mayor Impacto** — URL, type, size, load time, impact, reason.
4. **Plan de Acción Priorizado** — Table ordered by 80/20 score descending.
5. **Solución Técnica Detallada** — Per finding: problem, evidence, code,
   expected gain.
6. **Quick Wins** — Changes completable in < 1 day.
7. **High Impact Changes** — Best ROI changes.
8. **Roadmap** — Phase 1 (Week 1), Phase 2 (2–4 weeks), Phase 3 (1–3 months).

---

## Supported Environments

| Environment | Invocation                                   | Skill installed via            |
| ----------- | -------------------------------------------- | ------------------------------ |
| Claude Code | `/cc-pagespeed --url <url>`                  | `install preset --target claude` |
| OpenCode    | `cc-pagespeed --url <url>`                   | `install preset --target opencode` |
| Codex       | `"Run a PageSpeed audit for: <url>"`         | `install preset --target codex` |

---

## Core Web Vitals Thresholds

| Metric | Good     | Needs Improvement | Critical  |
| ------ | -------- | ----------------- | --------- |
| LCP    | ≤ 2.5 s  | 2.5 s – 4.0 s     | > 4.0 s   |
| INP    | ≤ 200 ms | 200 ms – 500 ms   | > 500 ms  |
| CLS    | ≤ 0.1    | 0.1 – 0.25        | > 0.25    |
| FCP    | ≤ 1.8 s  | 1.8 s – 3.0 s     | > 3.0 s   |
| TBT    | ≤ 200 ms | 200 ms – 600 ms   | > 600 ms  |
| TTFB   | ≤ 800 ms | 800 ms – 1.8 s    | > 1.8 s   |

LCP + TBT account for 55% of the Lighthouse Performance Score.

---

## Troubleshooting

### "CrUX data not available"

The URL does not have enough traffic in the Chrome User Experience Report. This
is normal for staging environments, internal tools, or low-traffic pages. Lab
data (Lighthouse) is still available and actionable.

### "API quota exceeded"

You are running without a key and hitting the shared rate limit. Set
`PAGESPEED_API_KEY` to get 25,000 requests/day.

### "Bun not found — using WebFetch fallback"

Install Bun to use the optimized TypeScript scripts:
```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

Without Bun, the skill calls PSI via WebFetch directly. All core metrics are
still available; only the parallelized HTML audit script is unavailable.

### "API key not found"

Verify the variable is set in the same session:
```powershell
$env:PAGESPEED_API_KEY   # should print the key value
```

If empty, set it again — environment variables set in one terminal are not
automatically available in another.

---

## Security Notes

- The API key is read from the environment at runtime. **Never hardcode it in
  any file tracked by git.**
- The command performs read-only HTTP GET requests. It does not authenticate
  to the target site, send cookies, or follow redirects to external domains.
- SSRF prevention: the PSI API endpoint is `googleapis.com`. The command does
  not call private IP ranges or non-HTTP(S) schemes.
