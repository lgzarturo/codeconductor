# Roadmap

This document tracks the planned evolution of CodeConductor.

Versions are sequential and intentionally constrained. Each release must be
usable before the next begins.

---

## v0.1.0 — OpenCode Baseline

**Goal:** A functional preset for OpenCode + Spring Boot Kotlin. Manual install.
No CLI.

- [ ] Repository structure
- [ ] README
- [ ] AGENTS.md base
- [ ] docs/philosophy.md
- [ ] docs/architecture.md
- [ ] docs/routing-policy.md
- [ ] docs/task-card-template.md
- [ ] docs/agent-scorecard.md
- [ ] docs/prompt-versioning.md
- [ ] OpenCode preset (`presets/opencode/`)
- [ ] 8 core Conductor Agents (orchestrator, task-coach, architect, implementer,
      tester, reviewer, docs, repo-explorer)
- [ ] Commands: feature, fix, refactor, review, test-plan
- [ ] Skills: spring-boot-kotlin, api-versioning, jpa-postgres, testing-strategy
- [ ] Routing Policy v0.1.0
- [ ] Task Card template
- [ ] Scorecard template
- [ ] End-to-end example (Spring Boot Kotlin)

**Does not include:** CLI, multi-provider support, automated evaluation,
dashboard.

---

## v0.2.0 — Init CLI

**Goal:** `npx codeconductor init` with deterministic stack detection.

- [ ] `codeconductor init` command
- [ ] Project Scanner (deterministic: files → deps → scripts → structure)
- [ ] Stack detectors: Spring Boot Kotlin, Next.js, FastAPI, Python
- [ ] Detection confidence model (low / medium / high)
- [ ] Preset resolver (target + stack + architecture)
- [ ] Config renderer for OpenCode target
- [ ] Safe Merger with idempotency markers (`CODECONDUCTOR:BEGIN/END managed`)
- [ ] `--dry-run` support
- [ ] `codeconductor doctor` — validate config presence and integrity
- [ ] Bug-fix workflow
- [ ] Refactor workflow
- [ ] API contract workflow
- [ ] Database migration workflow
- [ ] Prompt changelog discipline

---

## v0.3.0 — Multi-Stack

**Goal:** Extend detection and presets beyond Spring Boot Kotlin.

- [ ] Next.js preset
- [ ] FastAPI preset
- [ ] Generic backend preset
- [ ] Generic frontend preset
- [ ] Monorepo detection
- [ ] `codeconductor update` command
- [ ] Stricter review checklist

---

## v0.4.0 — Claude Target

**Goal:** Generate Claude-compatible configuration from the same CodeConductor
contract.

- [ ] Claude target renderer
- [ ] `CLAUDE.md` generation
- [ ] `.claude/skills/` generation
- [ ] `codeconductor sync claude` command
- [ ] Provider compatibility matrix (OpenCode vs Claude)
- [ ] Migration guide from OpenCode preset to Claude preset

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

- Security sandbox / runtime isolation (separate concern, separate module)
- Web dashboard
- Agent marketplace
- Automated PR bot
- Multi-tenant team policies
