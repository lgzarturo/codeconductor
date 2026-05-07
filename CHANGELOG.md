# Changelog

All notable changes to CodeConductor will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2026-05-07

### Added

- Repository structure and base documentation
- `README.md` with project identity, core concepts, and how-it-works flow
- `AGENTS.md` with workflow contract, routing policy, and 8 Conductor Agent definitions
- `docs/philosophy.md` — framework thesis and design principles
- `docs/architecture.md` — core pipeline and component design
- `docs/routing-policy.md` — risk classification and routing rules
- `docs/task-card-template.md` — structured task definition template
- `docs/agent-scorecard.md` — deliverable quality evaluation template
- `docs/prompt-versioning.md` — Agent Contract versioning convention
- OpenCode preset (`presets/opencode/`) with:
  - `opencode.jsonc` — project configuration with restricted permissions
  - 8 Conductor Agent contracts: orchestrator, task-coach, architect, implementer, tester, reviewer, docs, repo-explorer
  - 5 commands: feature, fix, refactor, review, test-plan
  - Versioned Agent Contracts under `prompts/v0.1.0/`
  - 4 Skills: spring-boot-kotlin, api-versioning, jpa-postgres, testing-strategy
- End-to-end example: Spring Boot Kotlin feature workflow
- `policy.yml` — sandboxed agent execution policy
- `CONTRIBUTING.md` with vocabulary enforcement and contribution requirements
- `ROADMAP.md` with versioned milestone plan
- `LICENSE` — MIT

### Design Decisions

- OpenCode is the only supported target for v0.1.0
- Stack detection is deterministic-first (files > deps > scripts > structure); LLM enrichment deferred to v2+
- CLI (`npx codeconductor init`) deferred to v0.2.0 — preset must be proven manually first
- Multi-provider abstraction deferred to v0.3.0+
- `package.json` is the single source of truth for version

---

[Unreleased]: https://github.com/codeconductor/codeconductor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/codeconductor/codeconductor/releases/tag/v0.1.0
