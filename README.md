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
> - `npx cc-codeconductor install council --target <opencode|claude|codex|all>` —
>   generates and writes preset files; supports `--global` to install to
>   `~/.opencode/`, `~/.claude/`, `~/.codex/`
> - `npx cc-codeconductor detect` — detects project stack and recommends presets
> - `npx cc-codeconductor doctor` — validates configuration and installed runner
>   directories
> - `npx cc-codeconductor update` — re-applies the council preset for the configured
>   target
> - Manual presets for OpenCode, Claude Code, and Codex
> - Versioned Agent Contracts
> - Routing Policy documentation
> - Task Card, Scorecard, and workflow templates
> - Spring Boot/Kotlin and Python/Django workflow guidance
>
> What does not exist yet:
>
> - Runtime sandbox enforcement
> - Policy compiler
> - Automated agent evaluation
> - Safe Merger
> - Multi-target `update` (currently updates only the `defaults.target` runner)
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

## Current Support (v0.2.0)

- OpenCode preset
- Claude Code-compatible preset
- Codex preset
- Spring Boot / Kotlin workflow
- Python / Django workflow guidance
- 8 core Conductor Agents
- Routing Policy v0.1.0
- Task Card template
- Scorecard template
- End-to-end example
- YAML-driven model configuration

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
```

On first run, `init` copies `council.yml` and `policy.yml` into
`.codeconductor/presets/` so you can customize them without touching framework
files. `install` reads from there first.

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

#### `install` — install council preset

```bash
npx cc-codeconductor install council --target opencode     # project-level
npx cc-codeconductor install council --target claude
npx cc-codeconductor install council --target codex
npx cc-codeconductor install council --target all          # all three targets

npx cc-codeconductor install council --target claude --global  # write to ~/.claude/
npx cc-codeconductor install council --target opencode --global
npx cc-codeconductor install council --target all --global

npx cc-codeconductor install council --target opencode --dry-run   # preview
npx cc-codeconductor install council --target opencode --force     # overwrite
```

Files generated per target:

| Target     | Files written                                                    |
| ---------- | ---------------------------------------------------------------- |
| `opencode` | `.opencode/commands/council.md`, `.opencode/agents/council-*.md` |
| `claude`   | `.claude/skills/council/SKILL.md`, `.claude/agents/council-*.md` |
| `codex`    | `.codex/config.toml`, `.codex/agents/council_*.toml`             |

With `--global`, the same files are written under `~/` instead of `./`.

#### `doctor` — validate configuration

```bash
npx cc-codeconductor doctor
```

Checks config exists and is valid, reports runner directory status.

#### `update` — re-apply preset

```bash
npx cc-codeconductor update
npx cc-codeconductor update --force
npx cc-codeconductor update --dry-run
```

Re-generates preset files for the `defaults.target` in your config.

### Global options

| Flag            | Description                              |
| --------------- | ---------------------------------------- |
| `--force`       | Overwrite existing files                 |
| `--dry-run`     | Preview actions without writing          |
| `--global`      | Target home directory instead of project |
| `--output json` | Machine-readable JSON output             |

### Config directory

`init` creates `.codeconductor/`:

```text
.codeconductor/
├── config.yml          # project settings, target, preset versions
└── presets/
    ├── council.yml     # customizable copy of the council preset
    └── policy.yml      # customizable copy of policy rules
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

Agent template files contain placeholders that are replaced during `install`:

| Placeholder          | Description                     |
| -------------------- | ------------------------------- |
| `{{MODEL_CLAUDE}}`   | Model for the Claude provider   |
| `{{MODEL_OPENCODE}}` | Model for the OpenCode provider |
| `{{MODEL_CODEX}}`    | Model for the Codex provider    |

To customize models, edit the YAML file for your target before running
`install`. Each file maps agent roles to provider-specific model names.

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
│   ├── core/               ← config, detection, filesystem, presets
│   ├── adapters/           ← opencode, claude, codex generators
│   ├── domain/council/     ← council spec, agent, contract
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

| Version    | Focus                                                       |
| ---------- | ----------------------------------------------------------- |
| **v0.2.0** | **CLI: init, detect, install, doctor, update — shipped** ✅ |
| v0.3.0     | Next.js, FastAPI, generic presets, monorepo support         |
| v0.4.0     | Provider compatibility matrix and target sync workflows     |
| v0.5.0     | Scorecard CLI, task outcome tracking, prompt regression     |
| v1.0.0     | Stable contracts, stable routing, documented evaluation     |

See [ROADMAP.md](ROADMAP.md) for details.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
