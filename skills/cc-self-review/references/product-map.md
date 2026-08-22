# CodeConductor — Product Map (internal)

Canonical pointers for `/cc-self-review`. Prefer these over inventing structure.

## One-liner

CodeConductor is a **multi-agent orchestration framework**: versioned agent
contracts, risk-based routing, presets for AI runners, and a CLI that installs
reproducible workflows into consumer repos — plus a growing Product OS
(product graph, ingest, orchestrate, verify).

## Planes

| Plano | Ubicación | Rol |
| ----- | --------- | --- |
| CLI | `src/cli/`, `src/commands/` | Entrypoints (`init`, `install`, `goal`, `seo`, `ccep`, `product`, …) |
| Core | `src/core/` | Presets, loop, goal, memory, CCEP, product-graph, complexity, filesystem safety |
| Domain | `src/domain/` | Council, SEO, LSP, product entities — lógica de negocio pura |
| Adapters | `src/adapters/` | Render/install por runner (opencode, claude, codex, cursor, agy, gemini) |
| Presets | `presets/` | Artefactos instalables en proyectos consumidores |
| Policy | `policy.yml`, `.codeconductor/` | Safety patterns, config, product-graph, goals |
| Docs | `docs/` | Architecture, CCEP, guides, release notes |
| Tests | `test/` | `bun test` |

## Flujos clave

1. **Install path**: detect/classify → resolve preset → render → merge → doctor
2. **Workflow loop**: `intake → structure → design → test → implement → validate → council → compact`
3. **Goal**: objective → YAML task graph → dependency-order delegation
4. **Council**: consensus + `securityVeto` / `complianceVeto`
5. **CCEP**: slash command → parse → resolve → profile → compiled prompts
6. **Product OS**: ingest → product-graph → impact / orchestrate / verify

## Stack del repo (no confundir con presets de consumidores)

- TypeScript + Bun, Zod, YAML
- Runtime deps mínimas (`zod`, `yaml`)
- Local: `bun run dev …` — no `npx cc-codeconductor` para iterar pre-release

## Docs locales

- [docs/architecture.md](../../docs/architecture.md)
- [docs/CCEP.md](../../docs/CCEP.md) / [docs/ccep-1.md](../../docs/ccep-1.md)
- [README.md](../../README.md) — Current Scope / Roadmap
- [AGENTS.md](../../AGENTS.md) — routing (consumidores); esta skill vive fuera del bloque managed

## Anti-scope

| Incluir en presets / CCEP / routing | Esta skill |
| ----------------------------------- | ---------- |
| `/cc-review`, `cc-feature`, council | No |
| `skills/cc-self-review` | Solo repo maintainer |
| `presets/cursor/skills/*` | No copiar |
