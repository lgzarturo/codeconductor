# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Identity

**CodeConductor** — a multi-agent orchestration framework for AI-assisted
software engineering.

Tagline: _Stop prompting. Start orchestrating._

This is a framework, not a prompt collection. The distinction is intentional and
must be preserved in all contributions. Every piece must reinforce structured
workflows, not ad-hoc prompting.

## Current State

The repository is in early design phase (pre-v0.1.0). The codebase contains:

- `implementacion.md` — complete design document: project identity, architecture
  decisions, MVP scope, CLI experience spec, and stack detection logic
- `policy.yml` — agent execution policy (sandboxed runtime, filesystem
  permissions, allowed/denied commands)
- `.vscode/` — editor config for TypeScript and Markdown

No CLI, no source code, no tests exist yet.

## Architecture

```text
codeconductor init
  └── Project Scanner (deterministic — files > deps > scripts > structure)
  └── Stack Classifier
  └── Preset Resolver
  └── Config Renderer
  └── Safe Merger
  └── Doctor / Validator
```

Detection is **deterministic first** (file presence, dependency keys, directory
layout). LLM enrichment is a v2+ concern — do not add it early.

### Planned repo structure (from design doc)

```text
presets/opencode/
  opencode.jsonc
  agents/          # orchestrator, task-coach, architect, implementer, tester, reviewer, docs, repo-explorer
  commands/        # feature, fix, refactor, review, test-plan
  prompts/v0.1.0/
  skills/          # spring-boot-kotlin, api-versioning, jpa-postgres, testing-strategy
docs/
  philosophy.md
  architecture.md
  routing-policy.md
  task-card-template.md
  agent-scorecard.md
  prompt-versioning.md
examples/spring-boot-kotlin/
```

## Core Terminology

Use the framework's own vocabulary — never call these "prompts":

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

## MVP Scope (v0.1.0)

Target: OpenCode only. Do not design abstractions for multi-provider until
v0.3.0+.

Includes: AGENTS.md, OpenCode preset, versioned prompts, commands
(feature/fix/refactor/review), Spring Boot/Kotlin skills, routing policy, task
card template, scorecard, one end-to-end example.

Excludes: Claude/OpenAI integration, dashboard, automated evaluation, CLI
binary, multi-provider abstraction.

## CLI Commands (planned)

```bash
npx codeconductor init                          # detect + scaffold
npx codeconductor init --target opencode --stack spring-boot-kotlin
npx codeconductor init --dry-run               # preview without writing
npx codeconductor doctor                        # validate config
npx codeconductor update                        # update existing config
```

## Stack Detection Signals

Detection priority: `files > dependencies > scripts > structure > conventions`

| Signal file        | Stack inferred           |
| ------------------ | ------------------------ |
| `build.gradle.kts` | Gradle + Kotlin          |
| `pom.xml`          | Maven + Java/Kotlin      |
| `package.json`     | Node / TS / React / Next |
| `pyproject.toml`   | Python (modern)          |
| `go.mod`           | Go                       |
| `Cargo.toml`       | Rust                     |

Spring Boot Kotlin strong signals: `build.gradle.kts` + `src/main/kotlin` +
`org.springframework.boot` + `kotlin("plugin.spring")`.

## Agent Policy

`policy.yml` defines sandboxed execution rules. Key constraints:

- Network: deny by default; allowlist includes `github.com`,
  `registry.npmjs.org`, `repo.maven.apache.org`
- Protected branches: `main`, `master`, `develop` — no force push, no rebase, no
  reset
- `git commit` and `git checkout` require user confirmation
- `rm -rf`, `sudo`, `curl | sh` and similar are hard-denied
