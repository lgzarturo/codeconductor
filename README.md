# CodeConductor

**Stop prompting. Start orchestrating.**

CodeConductor is an open-source framework for building structured, reproducible
AI-assisted software engineering workflows.

It helps developers and teams coordinate specialized agents for planning,
implementation, testing, documentation, and review — using versioned agent
contracts, task cards, and risk-based routing.

> [!IMPORTANT]
>
> ## Current Scope
>
> What works today:
>
> - `npx cc-codeconductor init` — detects project stack, writes
>   `.codeconductor/config.yml`, copies `council.yml` and `policy.yml` into
>   `.codeconductor/presets/`
> - `npx cc-codeconductor install council --target <opencode|claude|codex|agy|all>` —
>   generates and writes preset files; supports `--global` to install to
>   `~/.opencode/`, `~/.claude/`, `~/.codex/`, `~/.agents/`
> - `npx cc-codeconductor install lsp --target <opencode|claude|codex|gemini|cursor|agy|all>` —
>   installs LSP servers and configures AI coding tools; auto-detects project
>   languages or use `--lang` to override
> - `npx cc-codeconductor detect` — detects project stack and recommends presets
> - `npx cc-codeconductor doctor` — validates configuration and installed runner
>   directories
> - `npx cc-codeconductor update` — re-applies the council preset for the configured
>   target
> - `npx cc-codeconductor seo audit --url <url>` — runs a comprehensive SEO audit
>   on a single page (meta tags, schema.org, GEO readiness) and generates a
>   markdown report
> - `npx cc-codeconductor seo audit --sitemap <url>` — batch audits all URLs from
>   a sitemap.xml with rate limiting and SSRF prevention
> - `npx cc-codeconductor seo llms --sitemap <url>` — generates a `llms.txt` file
>   for AI-search readiness from sitemap content
> - `npx cc-codeconductor help` / `--help` — general CLI usage and command list
> - `npx cc-codeconductor cc-help` — preset inventory (skills, subagents,
>   commands) for the active or specified target
> - `npx cc-codeconductor debt-harvest` (alias: `harvest`) — scans source files
>   for `// defer` comments and writes `.codeconductor/debt-ledger.md`
> - `npx cc-codeconductor goal "<objective>"` (alias: `cc-goal`) — decomposes an
>   objective into a dependency-ordered task graph, writes
>   `.codeconductor/current-goal.yml`
> - `/cc-pagespeed --url <url>` — audits web performance using the PageSpeed
>   Insights API; applies the 80/20 principle to produce a prioritized report of
>   Core Web Vitals (LCP, TBT, CLS, FCP, TTFB) with framework-specific fixes;
>   requires `PAGESPEED_API_KEY` env var for full CrUX field data (optional but
>   recommended)
> - `npx cc-codeconductor install preset --target <opencode|claude|codex|agy|all>` —
>   installs the full preset (agents, prompts, skills, commands, settings) for the
>   chosen runner; use `--locale=es` to inject Spanish-aware instructions into
>   agent files, or rely on the locale saved during `init`
> - **Stack-specific presets (v0.4.0)**: `ts-next-drizzle`, `spring-kotlin-jpa`,
>   `laravel-tall`, `python-data-api` — bundle `architect` + `implementer`
>   contracts tuned to a single framework so `install preset` drops in the right
>   defaults for that stack.
> - **9 specialized skills (v0.4.0)**: `drizzle-schema-architect`,
>   `tailwind-responsive-auditor`, `seo-analytics-injector`,
>   `jpa-nplusone-detector`, `spring-auth-auditor`, `livewire-alpine-bridge`,
>   `fastapi-pydantic-strict`, `tdd-mutation-tester`, `auth-token-inspector` —
>   loaded automatically by the matching preset.
> - **Workflow Loop Core (v0.4.0, experimental)** — library-only 8-phase pipeline
>   (`intake → structure → design → test → implement → validate → council →
>   compact`) with operational guardrails (wall-clock timeout, max files
>   modified, max lines changed) and human-in-the-loop STOP gates after Design
>   and Council Verdict. Prefer CCEP slash-command workflows for production.
> - **Council consensus v0.4.0** — agent confidence thresholds
>   (`< 0.6` per-agent or `< 0.7` average escalates) and a `complianceVeto`
>   channel that overrides majority the same way `securityVeto` does.
> - **Goal orchestration (v0.4.0)** — `goal` planner writes
>   `.codeconductor/current-goal.yml`; the orchestrator delegates tasks in
>   dependency order and blocks dependents when a prerequisite is `blocked`.
> - **Memory compression + escalation emitter (v0.4.0)** — Phase 5 memory index
>   + token budget hook keeps inter-agent context below the configured budget;
>   the loop controller emits escalation reports when guardrails fire.
> - **Parallel subagents (v0.4.0)** — risk-based routing policy v0.4.0 enables
>   parallel execution for eligible agent sequences (architect + implementer
>   pattern, council verdict fan-out).
> - **Product Operating System (v1.0.0)** — typed product graph in
>   `.codeconductor/product-graph.json`, `cc ingest`, `cc product`, `cc orchestrate`,
>   `cc impact`, `cc verify`, episodic memory (`events.jsonl`), and feedback loop
> - Manual presets for OpenCode, Claude Code, and Codex
> - Versioned Agent Contracts
> - Routing Policy documentation
> - Task Card, Scorecard, and workflow templates
> - Spring Boot/Kotlin and Python/Django workflow guidance
>
> See [docs/v0.4.0-release-notes.md](docs/v0.4.0-release-notes.md) for the
> full v0.4.0 feature breakdown.
>
> What does not exist yet:
>
> - Runtime sandbox enforcement
> - Policy compiler
> - Automated agent evaluation
> - Safe Merger
>
> Security note:
>
> CodeConductor currently provides declarative policies and documented
> guardrails. It does not yet enforce OS-level isolation, shell sandboxing, or
> runtime permission boundaries by itself. Treat all agent execution as
> dependent on the capabilities and limitations of the target tool.

---

## Why CodeConductor?

Most AI coding workflows fail because they treat the model as a developer.

CodeConductor treats models as **specialized workers** inside a controlled
engineering system. It defines:

- who plans
- who implements
- who tests
- who reviews
- when to escalate
- when to stop
- how agent contracts evolve over time

This is not a prompt collection. It is a workflow framework.

---

## Core Concepts

| Concept            | Name in CodeConductor |
| ------------------ | --------------------- |
| Structured request | Task Card             |
| Flow decision      | Route                 |
| Specialized agent  | Conductor Agent       |
| Decision rules     | Routing Policy        |
| Versioned prompts  | Agent Contracts       |
| Reusable knowledge | Skills                |
| Evaluable output   | Deliverable           |
| Agent metrics      | Scorecard             |

---

## How It Works

```text
Task Card → Risk Classification → Routing Policy → Conductor Agent → Deliverable → Scorecard
```

1. Define the task using a structured Task Card
2. Classify risk (low / medium / high)
3. Route to the correct Conductor Agent
4. Implement with constraints
5. Validate with tests
6. Review before merge

---

## Current Support

- OpenCode preset
- Claude Code-compatible preset (see [Claude Environment Options & Best Practices](file:///c:/Users/R2D2/Documents/GitHub/codeconductor/docs/claude-env-options.md))
- Codex preset
- Spring Boot / Kotlin workflow
- Python / Django workflow guidance
- 12 core Conductor Agents
- Routing Policy v0.4.0
- Task Card template
- Scorecard template
- End-to-end example
- YAML-driven model configuration
- Provider-agnostic `AgentContract` abstraction with target renderers for Claude, OpenCode, Codex, and Agy
- Council consensus engine (`councilConsensus()`) for multi-agent governance with majority/unanimous algorithms, security veto, **compliance veto**, and **agent confidence thresholds** (v0.4.0)
- Phase 5 runtime modules — scoped context injection, TDD history compaction, concise inter-agent messaging, and token budget enforcement in the compile-fix loop
- **Workflow Loop Core (v0.4.0, experimental)** — 8-phase pipeline (`runWorkflowPipeline`) with wall-clock / files-modified / lines-changed guardrails and STOP gates at Design and Council Verdict (library-only; not a shipped CLI runtime)
- **Stack-specific presets (v0.4.0)** — `ts-next-drizzle`, `spring-kotlin-jpa`, `laravel-tall`, `python-data-api`
- **9 specialized skills (v0.4.0)** — drizzle-schema-architect, tailwind-responsive-auditor, seo-analytics-injector, jpa-nplusone-detector, spring-auth-auditor, livewire-alpine-bridge, fastapi-pydantic-strict, tdd-mutation-tester, auth-token-inspector
- **Goal orchestration (v0.4.0)** — `goal` planner + `goal-state` writer feed the orchestrator's dependency-order delegation loop
- **Memory compression + escalation emitter (v0.4.0)** — keeps inter-agent context within token budget and surfaces guardrail breaches as escalation reports

---

## CLI Usage

### Install

```bash
# Requires Bun ≥1.0 or Node ≥20.11
bun run src/cli/main.ts --help
# or after build:
# node dist/index.js --help
```

### Commands

#### `init` — initialize CodeConductor in a project

```bash
npx cc-codeconductor init              # detect stack, write .codeconductor/config.yml
npx cc-codeconductor init --force      # overwrite existing config
npx cc-codeconductor init --global     # write to ~/.codeconductor/
npx cc-codeconductor init --dry-run    # preview without writing
npx cc-codeconductor init --locale=es  # set Spanish as the instruction language
npx cc-codeconductor init --locale=en  # set English (default)
```

On first run, `init` copies `council.yml` and `policy.yml` into
`.codeconductor/presets/` so you can customize them without touching framework
files. `install` reads from there first.

> [!IMPORTANT]
>
> **`--locale` is remembered.** Once you run `init --locale=es`, the value is
> saved to `.codeconductor/config.yml`. Every subsequent `install preset` will
> automatically use that locale — no need to repeat the flag. To change it,
> run `init --locale=en --force` or edit `defaults.locale` in your config.

#### `detect` — detect project stack

```bash
npx cc-codeconductor detect
npx cc-codeconductor detect --output json
```

Output:

```text
Detected:
  - languages: javascript, typescript
  - runtimes: node, bun
  - frameworks: ...
```

#### `install preset` — install full agent preset

```bash
npx cc-codeconductor install preset --target opencode     # project-level
npx cc-codeconductor install preset --target claude
npx cc-codeconductor install preset --target codex
npx cc-codeconductor install preset --target agy          # antigravity cli
npx cc-codeconductor install preset --target all          # all targets

npx cc-codeconductor install preset --target claude --global   # write to ~/.claude/
npx cc-codeconductor install preset --target all --global

npx cc-codeconductor install preset --target claude --locale=es   # override locale once
npx cc-codeconductor install preset --target all --dry-run        # preview
npx cc-codeconductor install preset --target claude --force       # overwrite
```

Locale resolution order (first match wins):

1. `--locale` flag on the command line
2. `defaults.locale` in `.codeconductor/config.yml` (set by `init --locale`)
3. `en` (built-in default)

Files installed per target:

| Target     | Notable files                                                    |
| ---------- | ---------------------------------------------------------------- |
| `claude`   | `.claude/CLAUDE.md`, `.claude/settings.json`, `.claude/agents/` |
| `opencode` | `.opencode/agents/`, `.opencode/commands/`, `.opencode/skills/`  |
| `codex`    | `.codex/AGENTS.md`, `.codex/skills/`, `.codex/prompts/`          |

With `--global`, files are written under `~/` instead of `./`.

#### Stack-specific presets (v0.4.0)

Four stack-specific presets now ship in `presets/` and are registered in
`src/core/presets/preset-registry.ts`. Each one bundles a tuned
`architect.md` and `implementer.md` for a single stack, plus the matching
specialized skills (see below).

| Preset              | Stack                                                      | Contracts included        |
| ------------------- | ---------------------------------------------------------- | ------------------------- |
| `ts-next-drizzle`   | Next.js / Astro, Tailwind, Drizzle ORM, Bun, Postgres      | `architect`, `implementer`|
| `spring-kotlin-jpa` | Spring Boot, Kotlin/Java, Gradle, JPA, Hibernate           | `architect`, `implementer`|
| `laravel-tall`      | Laravel, Blade, Livewire, Alpine.js                        | `architect`, `implementer`|
| `python-data-api`   | Python, FastAPI, Django, uv                                | `architect`, `implementer`|

```ts
// Programmatic access via the registry
import { listPresets, getPreset } from 'cc-codeconductor/core/presets/preset-registry';

listPresets();
// [
//   { name: 'council',            version: '0.1.0', ... },
//   { name: 'seo-hotel',          version: '0.3.0', ... },
//   { name: 'ts-next-drizzle',    version: '0.4.0', ... },
//   { name: 'spring-kotlin-jpa',  version: '0.4.0', ... },
//   { name: 'laravel-tall',       version: '0.4.0', ... },
//   { name: 'python-data-api',    version: '0.4.0', ... },
// ]

const next = getPreset('ts-next-drizzle');
```

`init` / `detect` identifies the stack from the project and wires the
matching specialized skills onto the **generic** target workflow when you run
`install preset`. Full stack-specific asset pruning/replacement (swapping the
entire agent/command tree for a stack pack) is **not implemented yet** — the
registry and skill wiring are real; treat claims of a full stack install swap
as aspirational until that lands.

The full set of assets for a stack-specific preset is in
`presets/<preset-name>/agents/` — copy them manually if you need to apply a
preset by name.

#### `install council` — install council spec

```bash
npx cc-codeconductor install council --target opencode     # project-level
npx cc-codeconductor install council --target claude
npx cc-codeconductor install council --target codex
npx cc-codeconductor install council --target agy          # antigravity cli
npx cc-codeconductor install council --target all          # all targets

npx cc-codeconductor install council --target claude --global  # write to ~/.claude/
npx cc-codeconductor install council --target opencode --global
npx cc-codeconductor install council --target all --global

npx cc-codeconductor install council --target opencode --dry-run   # preview
npx cc-codeconductor install council --target opencode --force     # overwrite
```

#### `install lsp` — install and configure LSP servers

```bash
npx cc-codeconductor install lsp --target opencode          # auto-detect languages
npx cc-codeconductor install lsp --target all               # all AI tools
npx cc-codeconductor install lsp --target claude --lang typescript,python  # explicit languages
npx cc-codeconductor install lsp --target all --global      # global install + global configs
npx cc-codeconductor install lsp --target cursor --dry-run  # preview
npx cc-codeconductor install lsp --target all --force       # overwrite existing configs
```

Supported languages: TypeScript, PHP, Python via Pyright, Kotlin.
Supported targets: opencode, claude, codex, gemini, cursor, agy.

#### `doctor` — validate configuration

```bash
npx cc-codeconductor doctor
```

Checks config exists and is valid, reports runner directory status, validates that `AGENTS.md` and `CLAUDE.md` do not exceed the 40KB size limit, and checks if updates are available for installed presets, target runner configurations, or skills.

#### `update` — smart update preset

```bash
npx cc-codeconductor update
npx cc-codeconductor update --force
npx cc-codeconductor update --dry-run
npx cc-codeconductor update --global
```

Smart updates all currently installed target presets, council configurations, and skills (from `skills-lock.json`), preserving user edits outside managed blocks. Also validates that `AGENTS.md` and `CLAUDE.md` do not exceed the 40KB size limit.

#### `help` / `cc-help` — distinct help contracts

```bash
npx cc-codeconductor help                    # general CLI usage
npx cc-codeconductor --help                  # same general usage text
npx cc-codeconductor cc-help                 # preset inventory for active target
npx cc-codeconductor cc-help --target claude # inventory for a specific target
npx cc-codeconductor cc-help --output json   # machine-readable inventory
```

`help` prints the CLI command list. `cc-help` lists skills, subagents,
commands, and workflows for the active preset (or a specified `--target`).
Reads inventory from `presets/<target>/` in the project root.

#### `debt-harvest` — collect deferred debt items

```bash
npx cc-codeconductor debt-harvest            # scan src/ for // defer comments
npx cc-codeconductor debt-harvest --dir lib  # scan a different directory
npx cc-codeconductor harvest                 # alias
npx cc-codeconductor debt-harvest --output json
```

Scans source files for `// defer - [reason]` comments and consolidates them
into `.codeconductor/debt-ledger.md`, grouped by optional tag
(`// defer - reason --tag`). Read-only on source files; only writes the ledger.

Supported extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.go`, `.rs`, `.java`,
`.kt`, `.swift`, `.cs`, `.php`, `.scala`, `.dart`, `.c`, `.cpp`, `.h`, `.hpp`.

#### `goal` — decompose objective into task graph

```bash
npx cc-codeconductor goal "Add user authentication"
npx cc-codeconductor goal "Implement CRUD for invoices"
npx cc-codeconductor cc-goal "Add search with filters"   # alias
npx cc-codeconductor goal "Add user authentication" --output json
```

Matches the objective against built-in templates (auth, crud, search,
notification, migration) or falls back to a generic 4-task chain. Writes the
resulting task graph to `.codeconductor/current-goal.yml` with dependency
ordering. The orchestrator uses this file to delegate tasks in dependency order.


### Global options

| Flag             | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `--force`        | Overwrite existing files                                 |
| `--dry-run`      | Preview actions without writing                          |
| `--global`       | Target home directory instead of project                 |
| `--output json`  | Machine-readable JSON output                             |
| `--locale=en`    | Agent instruction language: `en` (default) or `es`      |

### Config directory

`init` creates `.codeconductor/`:

```text
.codeconductor/
├── config.yml          # project settings, target, locale, preset versions
└── presets/
    ├── council.yml     # customizable copy of the council preset
    └── policy.yml      # customizable copy of policy rules
```

Key fields in `config.yml`:

```yaml
defaults:
  target: opencode     # default runner for install/update
  locale: es           # instruction language injected into agent files
```

Edit `.codeconductor/presets/council.yml` to add, remove, or reconfigure agents
before running `install`.

#### Model Configuration

Each preset includes a YAML configuration file in `src/presets/models/` that
defines which models are used for each agent role:

```text
src/presets/models/
├── opencode.yml    # model defaults for OpenCode target
├── claude.yml      # model defaults for Claude target
└── codex.yml       # model defaults for Codex target
```

Agent template files contain placeholders replaced during `install`:

| Placeholder                    | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `{{MODEL_CLAUDE}}`             | Model for the Claude provider                 |
| `{{MODEL_OPENCODE}}`           | Model for the OpenCode provider               |
| `{{MODEL_CODEX}}`              | Model for the Codex provider                  |
| `{{LANGUAGE_INSTRUCTIONS}}`    | Locale-aware instruction injected by `locale` |

To customize models, edit the YAML file for your target before running
`install`. Each file maps agent roles to provider-specific model names.

#### Instruction Language (`--locale`)

Agent markdown files (`CLAUDE.md`, `AGENTS.md`, `README.md`) include a
`{{LANGUAGE_INSTRUCTIONS}}` placeholder that is replaced at install time based
on the active locale:

| Locale | Injected instruction |
| ------ | -------------------- |
| `en`   | *Prose/docs/code comments: be terse and direct. Prefer concrete nouns over abstract ones. Omit filler phrases. One idea per sentence.* |
| `es`   | *Spanish prose/docs/reports/Markdown: preserve natural Spanish orthography, including accents, `ñ`, `¿`, `¡`, and normal Unicode. The ASCII-only editing preference does not apply to these artifacts.* |

The locale is **sticky**: set it once with `init --locale=es` and every
subsequent `install preset` will use it automatically. Override per-run with
`install preset --locale=en`.

```bash
# One-time setup
npx cc-codeconductor init --locale=es

# All future installs use Spanish automatically
npx cc-codeconductor install preset --target=claude
npx cc-codeconductor install preset --target=all --global

# Override just this run
npx cc-codeconductor install preset --target=claude --locale=en

# Change the saved locale
npx cc-codeconductor init --locale=en --force
```

---

## Repository Structure

```text
codeconductor/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── ROADMAP.md
├── SECURITY.md
├── policy.yml              ← declarative policy model
│
├── src/                    ← CLI source (TypeScript + Bun)
│   ├── cli/                ← entry point, router, error codes
│   ├── commands/           ← init, detect, install, doctor, update
│   ├── core/               ← config, detection, filesystem, presets, goal
│   │   ├── context/        ← scoped context injection (Phase 5)
│   │   ├── compaction/     ← TDD history compaction hook (Phase 5)
│   │   ├── messages/       ← concise inter-agent formatter (Phase 5)
│   │   └── loop/           ← compile-fix loop controller (Phase 5)
│   ├── adapters/           ← opencode, claude, codex generators
│   ├── domain/council/     ← council spec, agent, contract
│   ├── domain/loop/        ← loop state machine
│   ├── validation/         ← Zod schemas
│   ├── utils/              ← Result type, logger, invariant
│   └── presets/council/    ← bundled council.yml preset
│
├── test/
│   ├── cli.test.ts         ← integration tests (32 tests)
│   └── fixtures/           ← bun, node, django, spring projects
│
├── docs/
│   ├── architecture.md
│   ├── security-model.md
│   ├── cli-contract.md
│   ├── policy-schema.md
│   ├── routing-policy.md
│   ├── task-card-template.md
│   ├── agent-scorecard.md
│   └── guides/
│
├── presets/                ← manual preset files (pre-CLI)
│   ├── opencode/
│   └── claude/
│
└── examples/
    └── spring-boot-kotlin/
```

---

## Roadmap

Current package status and the distinction between shipped,
implemented-unreleased, experimental, and planned capabilities are tracked in
[docs/current-status.md](docs/current-status.md).

| Version    | Focus                                                       |
| ---------- | ----------------------------------------------------------- |
| **v0.2.0** | **CLI: init, detect, install, doctor, update — shipped** ✅ |
| v0.3.0     | Next.js, FastAPI, generic presets, monorepo support         |
| **v0.4.0** | **Workflow Loop Core, stack-specific presets, 9 specialized skills, confidence thresholds + compliance veto in council consensus, goal orchestration, memory compression — shipped** ✅ |
| v0.5.0     | Scorecard CLI, prompt contracts v0.5.0 (Evaluation gate, 3 new agents, Grok fallback) — shipped ✅ |
| v1.0.0     | Product OS modules implemented in repository; release remains unpublished while package version is `0.5.0` |

See [ROADMAP.md](ROADMAP.md) for details.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
