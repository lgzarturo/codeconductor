# Roadmap

This document tracks the planned evolution of CodeConductor.

Versions are sequential and intentionally constrained. Each release must be
usable before the next begins.

---

## v0.1.0 — OpenCode + Claude Baseline

**Goal:** Functional presets for OpenCode and Claude Code + Spring Boot Kotlin.
Manual install. No CLI.

- [x] Repository structure
- [x] README
- [x] AGENTS.md base
- [x] docs/philosophy.md
- [x] docs/architecture.md
- [x] docs/routing-policy.md
- [x] docs/task-card-template.md
- [x] docs/agent-scorecard.md
- [x] docs/prompt-versioning.md
- [x] Codex preset (`presets/codex/`)
- [x] OpenCode preset (`presets/opencode/`)
- [x] Claude Code preset (`presets/claude/`)
- [x] 8 core Conductor Agents (orchestrator, task-coach, architect, implementer,
      tester, reviewer, docs, repo-explorer)
- [x] Commands: feature, fix, refactor, review, test-plan (both targets)
- [x] Skills: spring-boot-kotlin, api-versioning, jpa-postgres, testing-strategy
- [x] Routing Policy v0.1.0
- [x] Task Card template
- [x] Scorecard template
- [x] End-to-end example (Spring Boot Kotlin)
- [x] Manual install guides (OpenCode + Claude Code)

**Does not include:** CLI, automated evaluation, dashboard.

---

## Security Roadmap

### v0.1.x

- Declarative policy files
- Target-specific permissions
- Manual security guidance

### v0.2.x

- Policy schema validation
- Doctor checks for risky permissions
- Documentation warnings for unenforced policies
- Doctor checks for target policy drift, least-privilege role tools, secret
  denies, network posture, and worktree isolation guidance
- Target security compatibility matrix for Codex, OpenCode, and Claude

### v0.3.x+

- Policy compiler
- Structured command allowlist
- Filesystem boundary validation
- Symlink escape checks
- Renderer warnings when a target cannot enforce a canonical policy rule

### Future

- Dedicated low-privilege OS user
- Worktree-per-session runtime
- Optional containerized execution

---

## v0.2.0 — Init CLI

**Goal:** `npx cc-codeconductor init` with deterministic stack detection.

- [x] `npx cc-codeconductor init` command
- [x] Project Scanner (deterministic: files → deps → scripts → structure)
- [x] Stack detectors: Node.js, Bun, Spring Boot (Gradle/Maven), Django, Astro
      (Next.js, FastAPI deferred to v0.3.0)
- [x] Detection confidence model (low / medium / high)
- [x] Preset resolver (target + stack + architecture)
- [x] Config renderer for OpenCode target (Claude and Codex renderers also
      shipped)
- [x] `--dry-run` support
- [x] `npx cc-codeconductor doctor` — validate config presence and integrity
- [x] `npx cc-codeconductor doctor` — report target security compatibility gaps
- [x] Safe Merger with idempotency markers (`CODECONDUCTOR:BEGIN/END managed`)
- [x] Bug-fix workflow
- [x] Refactor workflow
- [x] API contract workflow
- [x] Database migration workflow
- [x] Prompt changelog discipline

### Plan to Complete v0.2.0

The remaining v0.2.0 work must preserve the CodeConductor workflow contract:
Task Card first, deterministic routing, minimal diff, explicit verification, and
human review before merge. Each item below should ship as a small, independently
reviewable change with tests and documentation updates.

#### Phase 1 — Detection and Preset Selection

**Objective:** make `init` decisions explainable and deterministic before adding
more workflow automation.

- **Detection confidence model (low / medium / high)**
  - Add a confidence score to the project detection result based on signal
    strength, not heuristics hidden in command output.
  - Suggested rules:
    - `high`: multiple aligned signals, e.g. framework files plus dependency
      declarations plus runtime/package-manager signals.
    - `medium`: one strong framework signal or multiple generic language/runtime
      signals.
    - `low`: generic project signals only, conflicting framework signals, or
      incomplete metadata.
  - CLI output should show detected stack, confidence, and the signals that
    justify the classification.
  - Acceptance criteria:
    - `detect --output json` includes `confidence` and `signals`.
    - ambiguous fixtures produce `low` or `medium`, not `high`.
    - existing stack fixtures keep deterministic results.

- **Preset resolver (target + stack + architecture)**
  - Introduce a resolver that maps detection output plus requested target to a
    concrete preset plan.
  - The resolver should be pure and testable: input is
    `{ target, stack, architecture?, confidence }`; output is a list of preset
    assets and warnings.
  - Do not let install commands infer file paths directly from detector details.
  - Acceptance criteria:
    - unsupported stack/target combinations return actionable warnings.
    - `--dry-run` displays the resolved preset plan without writing files.
    - JSON output exposes the selected target, stack, architecture, confidence,
      selected preset version, and warnings.

#### Phase 2 — Safety and Idempotent Writes

**Objective:** make generated files repeatable, auditable, and safe to update in
real projects.

- **Safe Merger with idempotency markers (`CODECONDUCTOR:BEGIN/END managed`)**
  - Implement a shared merge utility for files that combine generated content
    with user-maintained content.
  - Managed blocks must be replaced in place; unmanaged content must be
    preserved byte-for-byte.
  - If only one marker exists, the merger must fail closed and report the file
    as unsafe to update.
  - Acceptance criteria:
    - first install creates a managed block.
    - rerun updates only the managed block.
    - content before, after, and outside markers remains unchanged.
    - malformed markers produce a clear error and no partial write.

- **`npx cc-codeconductor doctor` — report target security compatibility gaps**
  - Add doctor checks that compare configured target capabilities against the
    canonical policy model.
  - The check should report gaps, not silently downgrade security. Examples:
    filesystem deny support, command allowlist support, network enforcement,
    secret path blocking, global install risk, and worktree isolation guidance.
  - Acceptance criteria:
    - doctor reports pass/warn/fail per target.
    - JSON output includes structured `securityCompatibility` results.
    - warnings are actionable and reference the target that cannot enforce a
      rule.

#### Phase 3 — Workflow Coverage

**Objective:** ship the missing high-value Conductor workflows using the same
Task Card, routing, implementation, test, and review discipline as the feature
workflow.

- **Bug-fix workflow**
  - Intake must capture reproduction steps, expected behavior, actual behavior,
    affected scope, regression risk, and verification command.
  - Route low-risk isolated fixes to `implementer`; route medium/high fixes to
    `task-coach -> implementer -> tester`.
  - Acceptance criteria:
    - generated workflow requires a regression test or explicit test-gap note.
    - deliverable includes root cause, files changed, tests run, and residual
      risk.

- **Refactor workflow**
  - Require explicit behavior-preservation criteria and a scope boundary before
    any edit.
  - Route low-risk refactors to `implementer`; route medium/high refactors to
    `architect -> implementer -> reviewer`.
  - Acceptance criteria:
    - workflow states what must not change.
    - tests prove behavior equivalence where coverage exists.
    - reviewer checks scope creep and architecture alignment.

- **API contract workflow**
  - Treat API shape changes as high-risk by default.
  - Require request/response examples, backward compatibility notes, versioning
    impact, and contract tests.
  - Route through `architect -> implementer -> reviewer`.
  - Acceptance criteria:
    - Task Card includes API contract and compatibility constraints.
    - docs/OpenAPI updates are required when public contracts change.
    - reviewer blocks on missing contract tests or undocumented breaking
      changes.

- **Database migration workflow**
  - Treat schema changes as high-risk by default.
  - Require migration plan, rollback/forward-fix notes, data backfill strategy,
    and deployment-order constraints.
  - Route through `architect -> implementer -> tester -> reviewer`.
  - Acceptance criteria:
    - migration and model changes are reviewed together.
    - tests cover migration-sensitive behavior where the stack supports it.
    - deliverable calls out lock risk, data risk, and operational sequencing.

#### Phase 4 — Prompt and Contract Discipline

**Objective:** keep agent contracts versioned and auditable as workflows evolve.

- **Prompt changelog discipline**
  - Every prompt, agent contract, routing policy, or skill behavior change must
    have a changelog entry under `[Unreleased]` before release.
  - The changelog entry must state the affected target(s), agent(s), behavior
    change, and migration impact.
  - Prompt updates should be reviewed like code: diff-first, minimal change,
    tests or examples updated when behavior changes.
  - Acceptance criteria:
    - PR/review checklist includes prompt changelog verification.
    - release process fails or warns when prompt files changed without a
      changelog entry.
    - prompt versioning docs define when to bump contract versions versus
      updating current draft prompts.

#### Recommended Delivery Order

1. Detection confidence model.
2. Preset resolver.
3. Safe Merger.
4. Doctor security compatibility checks.
5. Bug-fix workflow.
6. Refactor workflow.
7. API contract workflow.
8. Database migration workflow.
9. Prompt changelog discipline and release guard.

This order keeps the foundation deterministic before expanding workflow surface
area, then adds safety checks before introducing higher-risk workflows.

**Shipped beyond original scope:**

- `npx cc-codeconductor install council --target <opencode|claude|codex|all>` —
  preset installer for all three target tools
- `--global` flag on `init` and `install` — writes to `~/.codeconductor/`,
  `~/.claude/`, `~/.opencode/`, `~/.codex/`
- `.codeconductor/presets/` config directory — user-customizable copy of
  `council.yml` and `policy.yml`; preset loader reads from here first

---

## v0.3.0 — Multi-Stack

**Goal:** Extend detection and presets beyond Spring Boot Kotlin.

- [x] Python / Django / PostgreSQL preset (skills: python, python-django-stack,
      django-orm, django-testing)
- [ ] Next.js preset
- [ ] FastAPI preset
- [ ] Astro web page preset
- [ ] SEO Off page preset
- [ ] Generic backend preset
- [ ] Generic frontend preset
- [ ] Monorepo detection
- [x] `npx cc-codeconductor update` command
- [ ] Stricter review checklist

---

## v0.4.0 — Target Sync and Compatibility

**Goal:** Formalize provider compatibility and add CLI sync commands for target
configurations. Manual OpenCode and Claude Code-compatible presets already ship
in v0.1.0.

- [x] Claude target renderer (`presets/claude/` — manual, shipped in v0.1.0)
- [x] `CLAUDE.md` generation — agent contracts + routing policy embedded
- [x] `.claude/skills/` generation — 4 skills, tool-agnostic content
- [x] Manual install guide (`docs/guides/manual-install-claude.md`)
- [ ] `npx cc-codeconductor sync claude` command (CLI — deferred to v0.2.0+)
- [ ] Provider compatibility matrix (OpenCode vs Claude) — formal doc
- [ ] `npx cc-codeconductor update --target claude` command

---

## v0.5.0 — Evaluation

**Goal:** Measure agent quality over time.

- [ ] Scorecard CLI
- [ ] Task outcome tracking
- [ ] Prompt version diff
- [ ] Regression checklist
- [ ] Model comparison template
- [ ] Cost / quality matrix

---

## v1.0.0 — Stable

**Goal:** Production-ready, well-documented, community-ready.

- [ ] Stable agent contracts
- [ ] Stable routing policy
- [ ] Provider presets: OpenCode, Claude, Codex
- [ ] Real examples (minimum 3 stacks)
- [ ] Contribution guidelines finalized
- [ ] Documented evaluation process
- [ ] GitHub Actions integration

---

## Not in Scope (yet)

These are intentionally deferred to avoid premature abstraction:

- Web dashboard
- Agent marketplace
- Automated PR bot
- Multi-tenant team policies
