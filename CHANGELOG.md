# Changelog

All notable changes to CodeConductor will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- `presets/claude/commands/tdd-cycle.md` — new `/tdd-cycle` command implementing
  a structured Red-Green-Refactor workflow with phase gates (RED report → GREEN
  report → REFACTOR report + Reviewer), enforcing strict TDD discipline
- `presets/claude/commands/cc/` — CodeConductor-namespaced aliases for all
  Claude preset commands (`/cc:feature`, `/cc:fix`, `/cc:refactor`, `/cc:review`,
  `/cc:test-plan`, `/cc:tdd-cycle`); enabled via Claude Code subdirectory
  namespacing
- `SECURITY.md` with supported versions, current security model, and
  vulnerability reporting guidance
- `docs/security-model.md` documenting current guarantees, non-guarantees, trust
  boundaries, and planned runtime isolation
- `docs/current-limitations.md` clarifying that CodeConductor has no runtime,
  CLI, policy compiler, or automated evaluation yet
- `docs/cli-contract.md` and `docs/policy-schema.md` defining future CLI and
  policy contracts before implementation
- `presets/opencode/skills/python/` — Python clean code patterns (naming, type
  hints, decorators, exceptions, service/repository patterns)
- `presets/opencode/skills/python-django-stack/` — Django conventions (FBV,
  service layer, JSON API shapes, pagination, PDF, cart, models)
- `presets/opencode/skills/django-orm/` — ORM patterns (N+1, select_related,
  bulk ops, transactions, multi-tenant upload paths)
- `presets/opencode/skills/django-testing/` — Django test constraints
  (SimpleTestCase + mocks for tenant apps, RequestFactory, FakeSession,
  MagicMock traps, queryset chain mocking)
- Same 4 skills mirrored to `presets/claude/skills/`
- `docs/stacks/python-django-postgresql.md` — stack definition and reference
- `examples/python-django-postgresql/` — end-to-end feature example with Task
  Card and Technical Plan

### Changed

- `presets/opencode/opencode.jsonc` — added Python/Django bash patterns:
  `uv run pytest*`, `make tests*`, `make lint*`, `make verifymigrations*`,
  `uv run djlint --check*` to allow; Django DB operations to ask
- `presets/opencode/agents/orchestrator.md` (v0.2.0) — added Stack-Aware Skill
  Routing section with Python/Django detection signals, per-agent skill
  injection, and TDD gate for medium/high tasks
- `presets/opencode/agents/tester.md` (v0.2.0) — added Python/Django Testing
  section: base class selection table, Django runner commands, TDD sequence,
  module docstring requirement
- `presets/opencode/prompts/v0.2.0/` — new versioned prompt directory with
  updated orchestrator and tester contracts
- `docs/routing-policy.md` (v0.2.0) — added Django high-risk path patterns
  (`apps/*/migrations/**`, `config/settings*.py`, `apps/users/**`) and DRF
  public contract path (`apps/*/serializers.py`)
- `docs/prompt-versioning.md` — v0.1.0 marked deprecated, v0.2.0 added as active
- `presets/claude/CLAUDE.md` — added skill activation rules for the 4 new
  Python/Django skills

- `README.md` now states the current pre-CLI scope, what works today, what is
  planned, and the current security limitations
- `CLAUDE.md` now reflects the repository's current documentation-first and
  preset-based state
- `docs/architecture.md` and `ROADMAP.md` now separate implemented preset
  documentation from planned runtime security capabilities
- Version documentation now treats `package.json` `0.1.0` as the active
  canonical version
- `presets/opencode/opencode.jsonc` — added Python/Django bash patterns:
  `uv run pytest*`, `make tests*`, `make lint*`, `make verifymigrations*`,
  `uv run djlint --check*` to allow; Django DB operations to ask
- `presets/opencode/agents/orchestrator.md` — added Stack-Aware Skill Routing
  section with Python/Django detection signals, per-agent skill injection, and
  TDD gate for medium/high tasks
- `presets/opencode/agents/tester.md` — added Python/Django Testing section:
  base class selection table, Django runner commands, TDD sequence, module
  docstring requirement
- `presets/opencode/prompts/v0.2.0/` — unreleased draft prompt directory with
  updated orchestrator and tester contracts
- `docs/routing-policy.md` — added Django high-risk path patterns
  (`apps/*/migrations/**`, `config/settings*.py`, `apps/users/**`) and DRF
  public contract path (`apps/*/serializers.py`)
- `docs/prompt-versioning.md` — keeps v0.1.0 active while v0.2.0 remains an
  unreleased draft
- `presets/claude/CLAUDE.md` — added skill activation rules for the 4 new
  Python/Django skills

### Fixed

- `policy.yml` and OpenCode preset permissions now require confirmation for
  `git push`
- `policy.yml` now labels current execution as target-tool-dependent instead of
  a CodeConductor-enforced sandbox

---

## [0.1.0] — 2026-05-07

### Added

- Repository structure and base documentation
- `README.md` with project identity, core concepts, and how-it-works flow
- `AGENTS.md` with workflow contract, routing policy, and 8 Conductor Agent
  definitions
- `docs/philosophy.md` — framework thesis and design principles
- `docs/architecture.md` — core pipeline and component design
- `docs/routing-policy.md` — risk classification and routing rules
- `docs/task-card-template.md` — structured task definition template
- `docs/agent-scorecard.md` — deliverable quality evaluation template
- `docs/prompt-versioning.md` — Agent Contract versioning convention
- OpenCode preset (`presets/opencode/`) with:
  - `opencode.jsonc` — project configuration with restricted permissions
  - 8 Conductor Agent contracts: orchestrator, task-coach, architect,
    implementer, tester, reviewer, docs, repo-explorer
  - 5 commands: feature, fix, refactor, review, test-plan
  - Versioned Agent Contracts under `prompts/v0.1.0/`
  - 4 Skills: spring-boot-kotlin, api-versioning, jpa-postgres, testing-strategy
- Claude Code preset (`presets/claude/`) with:
  - `CLAUDE.md` — all 8 Conductor Agent role contracts embedded, routing policy,
    skill activation rules
  - `settings.json` — permission allowlist and denylist in Claude Code format
  - 5 commands: feature, fix, refactor, review, test-plan (adapted — role
    adoption instead of `@agent` invocation)
  - 4 Skills: spring-boot-kotlin, api-versioning, jpa-postgres, testing-strategy
    (identical to OpenCode)
- Installation guides:
  - `docs/guides/manual-install-opencode.md` — step-by-step install for OpenCode
    target
  - `docs/guides/manual-install-claude.md` — step-by-step install for Claude
    Code target
- End-to-end example: Spring Boot Kotlin feature workflow
- `policy.yml` — declarative agent execution policy
- `CONTRIBUTING.md` with vocabulary enforcement and contribution requirements
- `ROADMAP.md` with versioned milestone plan
- `LICENSE` — MIT

### Design Decisions

- Two targets shipped in v0.1.0: OpenCode and Claude Code — both use the same
  Agent Contracts from `prompts/v0.1.0/`; the presets are tool-specific
  integration layers
- OpenCode target: agents invoked via `@agent-name` runtime syntax; config in
  `opencode.jsonc`
- Claude Code target: agent roles embedded in `CLAUDE.md`; commands use
  role-adoption language; permissions in `.claude/settings.json`
- Skills are tool-agnostic — identical content, different destination path
  (`.opencode/skills/` vs `.claude/skills/`)
- Stack detection is deterministic-first (files > deps > scripts > structure);
  LLM enrichment deferred to v2+
- CLI (`npx codeconductor init`) deferred to v0.2.0 — presets must be proven
  manually first
- Multi-provider abstraction deferred to v0.3.0+
- `package.json` is the single source of truth for version

---

[Unreleased]: https://github.com/lgzarturo/codeconductor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lgzarturo/codeconductor/releases/tag/v0.1.0
