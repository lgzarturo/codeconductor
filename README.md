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
> CodeConductor is currently in an early pre-CLI stage.
>
> What works today:
>
> - Manual installation of OpenCode and Claude-compatible presets
> - Versioned Agent Contracts
> - Routing Policy documentation
> - Task Card, Scorecard, and workflow templates
> - Spring Boot/Kotlin and Python/Django workflow guidance
>
> What does not exist yet:
>
> - `npx codeconductor init`
> - Automated project detection
> - Safe Merger
> - `codeconductor doctor`
> - Runtime sandbox enforcement
> - Policy compiler
> - Automated agent evaluation
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

## Current Support (v0.1.0)

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

---

## Installation (planned)

```bash
npx codeconductor init
```

Detection output example:

```text
Detected project:
  Language:      Kotlin
  Framework:     Spring Boot
  Build tool:    Gradle
  Database:      PostgreSQL
  Test stack:    JUnit 5 + MockK
  Architecture:  feature-oriented MVC (confidence 0.72)

Recommended preset: opencode/spring-boot-kotlin

Files to create:
  AGENTS.md
  opencode.jsonc
  .opencode/agents/*
  .opencode/commands/*
  .opencode/skills/*

Apply? [y/N]
```

Additional CLI commands:

```bash
npx codeconductor init --target opencode --stack spring-boot-kotlin
npx codeconductor init --dry-run
npx codeconductor doctor
npx codeconductor update
```

> CLI is planned for v0.2.0. For v0.1.0, install manually following the docs.

---

## Repository Structure

```text
codeconductor/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── ROADMAP.md
├── SECURITY.md
├── CONTRIBUTING.md
├── AGENTS.md
├── CLAUDE.md
│
├── docs/
│   ├── philosophy.md
│   ├── architecture.md
│   ├── security-model.md
│   ├── preset-security-analysis.md
│   ├── current-limitations.md
│   ├── cli-contract.md
│   ├── policy-schema.md
│   ├── routing-policy.md
│   ├── task-card-template.md
│   ├── agent-scorecard.md
│   ├── prompt-versioning.md
│   ├── guides/
│   └── examples/
│       └── spring-boot-kotlin-feature.md
│
├── presets/
│   ├── opencode/
│   │   ├── opencode.jsonc
│   │   ├── agents/
│   │   ├── commands/
│   │   ├── prompts/v0.1.0/
│   │   └── skills/
│   └── claude/
│       ├── CLAUDE.md
│       ├── settings.json
│       ├── commands/
│       └── skills/
│
└── examples/
    └── spring-boot-kotlin/
```

---

## Roadmap

| Version | Focus                                                       |
| ------- | ----------------------------------------------------------- |
| v0.1.0  | OpenCode and Claude presets, stack guidance, manual install |
| v0.2.0  | `codeconductor init` CLI, deterministic detection, doctor   |
| v0.3.0  | Next.js, FastAPI, generic presets, monorepo support         |
| v0.4.0  | Provider compatibility matrix and target sync workflows     |
| v0.5.0  | Scorecard CLI, task outcome tracking, prompt regression     |
| v1.0.0  | Stable contracts, stable routing, documented evaluation     |

See [ROADMAP.md](ROADMAP.md) for details.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
