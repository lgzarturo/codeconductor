# CodeConductor — Agent Instructions

This project uses CodeConductor for structured AI-assisted engineering
workflows.

## Behavioral Discipline

These principles apply to **all agents** in every workflow. They reduce common
LLM coding mistakes and bias toward caution over speed.

1. **Think Before Coding** — State assumptions explicitly. If uncertain, ask. If
   multiple interpretations exist, present them — don't pick silently. If a
   simpler approach exists, say so.
2. **Simplicity First** — Minimum code that solves the problem. No features
   beyond what was asked. No abstractions for single-use code. No speculative
   "flexibility." Ask: "Would a senior engineer say this is overcomplicated?"
3. **Surgical Changes** — Touch only what you must. Don't "improve" adjacent
   code. Match existing style. Remove only what YOUR changes made unused. Every
   changed line must trace directly to the user's request.
4. **Goal-Driven Execution** — Transform tasks into verifiable goals with
   success criteria. For multi-step tasks, state a plan with verification
   checks. Loop until verified.

<!-- CODECONDUCTOR:BEGIN managed -->

# CodeConductor — Pi Preset

This file configures CodeConductor for **Pi** (pi.dev — `earendil-works/pi`,
the coding-agent CLI, not Inflection's Pi). It lives at the project root
(`AGENTS.md`) so Pi's context-file loader picks it up automatically.

## Behavioral Discipline

1. **Think Before Coding** — state assumptions; ask if uncertain; present
   alternatives instead of picking silently.
2. **Simplicity First** — minimum code that solves the problem; no
   speculative abstractions.
3. **Surgical Changes** — touch only what the task requires; match existing
   style; remove only what your own change made unused.
4. **Goal-Driven Execution** — turn the task into a verifiable goal with a
   success check; loop until it passes.

## Commands

CodeConductor ships its slash commands as Pi prompt templates under
`.pi/prompts/`, invoked as `/cc-<name>` (e.g. `/cc-feature`, `/cc-review`).
Run `/cc-ask "<problem>"` when unsure which one applies — it recommends
exactly one and stops; it does not start the workflow.

Skills live under `.agents/skills/` (shared with the agy preset — Pi
discovers skills there natively, per its own docs). Read
`.agents/skills/using-cc-skills/SKILL.md` first — it maps intent to the
right slash command.

Pi has no Task tool or subagents: every command runs in your own session.
Where a step says "adopt the `X` role", read the matching file under
`.agents/agents/` (short) or `.agents/prompts/v1.0.0/` (full contract) and
act as that role for the rest of the step.

## What never changes

- Do not invoke the Implementer without an accepted Technical Plan.
- Do not skip the Reviewer step for medium- or high-risk changes.
- Do not store secrets in any file loaded by Pi.

<!-- CODECONDUCTOR:END managed -->

---

## Local Development Execution Rule

Do NOT use `npx cc-codeconductor` for local testing. Use `bun run dev` instead
to test all current flow before publishing version v1.0.0 to npm.

| Production (`npx`)                       | Local development (`bun run dev`) |
| ---------------------------------------- | --------------------------------- |
| `npx cc-codeconductor seo audit --url …` | `bun run dev seo audit --url …`   |
| `npx cc-codeconductor goal "…"`          | `bun run dev goal "…"`            |
| `npx cc-codeconductor ccep parse …`      | `bun run dev ccep parse …`        |

## Project-Specific Notes

This section is manually maintained. Add project-specific conventions,
exceptions, or context here.

## Agent Routing Table

| Task Type            | Risk        | Route                                               |
| -------------------- | ----------- | --------------------------------------------------- |
| New feature design   | any         | `architect` → `tester` → `implementer`              |
| Bug fix              | low         | `tester` → `implementer`                            |
| Bug fix              | medium–high | `task-coach` → `tester` → `implementer`             |
| Refactor             | low         | `implementer`                                       |
| Refactor             | medium–high | `architect` → `implementer` → `complexity-auditor` → `reviewer` |
| API change           | any         | `architect` → `implementer` → `complexity-auditor` → `reviewer` |
| Database migration   | any         | `architect` → `tester` → `implementer` → `complexity-auditor` → `reviewer` |
| Test coverage        | any         | `tester`                                            |
| Documentation update | any         | `docs`                                              |
| Codebase exploration | any         | `repo-explorer`                                     |
| Code review          | any         | `reviewer`                                          |
| DDD→SDD→TDD pipeline | any         | `contract-builder` → `architect` → `tester` → `implementer` |

Each arrow represents a handoff. The next agent starts only after the previous
agent's deliverable is available.

### Internal skills (not shipped)

| Skill | Description | Path |
| ----- | ----------- | ---- |
| `cc-self-review` | Self-review del producto (seguridad, implementación, flujo, features, mental model). Solo este repo. | [SKILL.md](skills/cc-self-review/SKILL.md) |
| `cc-update-preset-models` | Refresca slugs de modelo en `src/presets/models/` y tests de install. Solo este repo. | [SKILL.md](skills/cc-update-preset-models/SKILL.md) |

**Slash commands (Cursor, solo este proyecto):** `/cc-self-review` · `/cc:self-review` · `/cc-update-preset-models` · `/cc:update-preset-models`

- Canonical skills: `skills/cc-self-review/`, `skills/cc-update-preset-models/` (fuera de `presets/` y del npm package)
- Cursor stubs: `.cursor/commands/` y `.cursor/skills/` para cada una
- **Never** copy into `presets/`, CCEP profiles, Conductor Agent routing, or `src/presets/`
- This repo **dogfoods** `bun run dev install preset --target cursor`. Maintainer stubs are skipped by `isMaintainerReservedDest` (including `--force`).

### OpenSpec

OpenSpec is a **delivery loop** (validate-backlog → discover → design → test → implement → review) and the backlog tool for `BACKLOG.md`. Author with `/cc-backlog` (`bun run dev` locally). Deliver with `bun run dev openspec …` and `/cc-openspec`.

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100KB unless explicitly required.
- Suggest running /cost when a session is running long to monitor cache ratio.
- Recommend starting a new session when switching to an unrelated task.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.
- When using tools, be precise and minimal with context.

## Context Budget

- If the task type differs from the previous one, execute "/clear" before
  starting.
- Delegate verbose operations to sub-agents.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community
structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with
`skill: "graphify"` before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when
  graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for
  relationships and `graphify explain "<concept>"` for focused concepts. These
  return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw
  grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates;
  dirty graph files are not a reason to skip graphify. Only skip graphify if the
  task is about stale or incorrect graph output, or the user explicitly says not
  to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of
  raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when
  query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current
  (AST-only, no API cost).

### complexity-auditor

**Role:** Analyzes code for bloat, unnecessary abstractions, and non-native
solutions. Produces a structured Complexity Audit Report with LOC deltas,
dependency changes, and bloat pattern findings.

**Use when:** Before reviewer in refactor (medium–high), API change, and
database migration routes.

**Permissions:**

- read: `allow`
- edit: `deny`
- bash: `deny`
- network: `deny`

**Does not:** Propose new dependencies, suggest new abstractions, recommend
external libraries, or edit any file.

### goal-planner

**Role:** Transforms an objective string into a YAML task graph with
dependencies. Deterministic template matching; objective → GoalGraph. No side
effects.

**Use when:** User runs `codeconductor goal "<objective>"` or the orchestrator
needs a multi-step plan before delegation.

**Permissions:**

- read: `allow`
- edit: `deny`
- bash: `deny`
- network: `deny`

**Does not:** Write files, execute commands, or make routing decisions.

**Dependency order delegation (orchestrator):**

When the orchestrator receives a GoalGraph, it delegates tasks in dependency
order. A task is routed only after all its `depends_on` targets complete with
status `done`. If a dependency is `blocked`, the dependent task remains
`pending`. The orchestrator tracks the graph state in
`.codeconductor/current-goal.yml`.

### contract-builder

**Role:** Defines API contracts, data shapes, and behavior specs before
implementation. Produces OpenAPI specs, JSON Schema, or TypeScript interfaces
that the implementer and tester use as the source of truth.

**Use when:** A new feature needs spec-before-implementation, an API contract
needs definition, or the DDD→SDD→TDD pipeline is triggered.

**Permissions:**

- read: `allow`
- edit: `ask` (docs, ADRs, OpenAPI only)
- bash: `deny`
- network: `deny`

**Does not:** Write implementation code. Modify source files.

## Agent Contract Notes

Agent permissions and routing in this file are the canonical Pi context
contract for this repository.
