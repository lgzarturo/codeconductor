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

**Goal:** `npx codeconductor init` with deterministic stack detection.

- [x] `codeconductor init` command
- [x] Project Scanner (deterministic: files → deps → scripts → structure)
- [x] Stack detectors: Node.js, Bun, Spring Boot (Gradle/Maven), Django, Astro
      (Next.js, FastAPI deferred to v0.3.0)
- [ ] Detection confidence model (low / medium / high)
- [ ] Preset resolver (target + stack + architecture)
- [x] Config renderer for OpenCode target (Claude and Codex renderers also
      shipped)
- [x] `--dry-run` support
- [x] `codeconductor doctor` — validate config presence and integrity
- [ ] `codeconductor doctor` — report target security compatibility gaps
- [ ] Safe Merger with idempotency markers (`CODECONDUCTOR:BEGIN/END managed`)
- [ ] Bug-fix workflow
- [ ] Refactor workflow
- [ ] API contract workflow
- [ ] Database migration workflow
- [ ] Prompt changelog discipline

**Shipped beyond original scope:**

- `codeconductor install council --target <opencode|claude|codex|all>` — preset
  installer for all three target tools
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
- [ ] Generic backend preset
- [ ] Generic frontend preset
- [ ] Monorepo detection
- [x] `codeconductor update` command
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
- [ ] `codeconductor sync claude` command (CLI — deferred to v0.2.0+)
- [ ] Provider compatibility matrix (OpenCode vs Claude) — formal doc
- [ ] `codeconductor update --target claude` command

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
