# Changelog

All notable changes to CodeConductor will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed

- Agent preset files now use native model conventions per tool instead of a
  multi-provider reference table: OpenCode and Claude sub-agent files
  (`presets/opencode/agents/*.md`) now include `model: "<model>"` in their YAML
  frontmatter, resolved at install time to the correct model for the target
  (e.g., `deepseek-v4-pro` for OpenCode architect, `claude-opus-4-7` for Claude
  architect); Codex `AGENTS.md` sections now show a single `**Model**:` line
  instead of a three-provider table; the `{{MODEL}}` placeholder in templates
  is resolved by `modelConfig.target` so the same source files serve all targets

### Added

- YAML-driven model configuration for agent presets — agent templates in
  `presets/opencode/agents/` and `presets/codex/AGENTS.md` now use
  `{{MODEL_CLAUDE}}`, `{{MODEL_OPENCODE}}`, and `{{MODEL_CODEX}}` placeholders
  that are resolved from YAML files in `src/presets/models/` during `install`;
  all three targets (opencode, claude, codex) are supported with per-role model
  definitions

---

## [0.2.0] - 2026-05-17

### Added

- CLI: `--global` flag on `install` — writes preset files to `~/.claude/`,
  `~/.opencode/`, or `~/.codex/` instead of the project-local directories;
  supports all targets including `--target=all`
- CLI: `init` now copies `council.yml` and `policy.yml` into
  `.codeconductor/presets/` as user-customizable sources of truth
- CLI: `init --global` initializes CodeConductor configuration under
  `~/.codeconductor/` for system-wide use
- CLI: preset loader checks `.codeconductor/presets/<name>.yml` before falling
  back to the bundled `src/presets/` path, allowing user customization without
  modifying framework files

### Fixed

- CLI: `init` without `--force` now preserves existing
  `.codeconductor/config.yml` instead of silently overwriting it

- `docs/preset-security-analysis.md` — comparative security analysis for Codex,
  OpenCode, and Claude presets; defines defense-in-depth layers, target
  compatibility gaps, and framework improvements for policy drift, isolation,
  command parsing, and secret handling
- `docs/security-model.md`, `docs/policy-schema.md`, `docs/cli-contract.md`,
  `SECURITY.md`, `ROADMAP.md`, `README.md`, and `docs/architecture.md` —
  expanded security model with target compatibility, canonical `policy.yml`
  guidance, doctor checks for unsafe permissions and isolation gaps, and
  explicit warnings when target tools cannot enforce a rule
- `policy.yml` — added target compatibility metadata for OpenCode, Claude, and
  Codex, including unsupported rules and warnings for target-dependent
  enforcement

- `docs/guides/agent-user-isolation.md` — developer guide for isolating AI agent
  execution (Claude Code, OpenCode, Codex) using dedicated OS users on POSIX and
  Windows 11; covers identity isolation, per-tool guardrail config, environment
  variable isolation, Git Worktree session isolation, and a verification
  checklist

**Preset: Git Worktree isolation (all three presets)**

- `presets/claude/CLAUDE.md` — Implementer role: added step 0 (create session
  worktree before any file edit), `Work in a worktree` implementation rule, and
  `Worktree` field in Implementation Summary
- `presets/claude/commands/cc/feature.md`, `fix.md`, `refactor.md` — added
  worktree note to each implementation step
- `presets/codex/AGENTS.md` — same additions to the `implementer` agent contract
- `presets/opencode/agents/implementer.md` — same additions
- `presets/opencode/commands/cc-feature.md`, `cc-fix.md`, `cc-refactor.md` —
  added worktree note to each implementation step
- `presets/opencode/prompts/v0.1.0/implementer.md`,
  `presets/opencode/prompts/v0.2.0/implementer.md` — same additions; checklist
  updated from "all five steps" to "all six steps"

- `AUTHORS.md` — project author and maintainer information
- `CODE_OF_CONDUCT.md` — community code of conduct (Contributor Covenant v2.1)
  and content usage guidelines for presets, templates, and skill files

**Codex CLI preset (new target tool)**

- `presets/codex/` — CodeConductor preset for OpenAI Codex CLI; all 8 agent
  contracts (orchestrator, task-coach, architect, implementer, tester, reviewer,
  docs, repo-explorer) embedded in a single `AGENTS.md` (Codex has no named
  agent file system); includes routing policy, hard rules, OpenAI model matrix,
  and trigger phrases replacing slash commands
- `presets/codex/skills/` — 11 skill files copied verbatim from the OpenCode
  preset (skills are tool-agnostic; all declare
  `tools: [claude, codex, opencode]`)
- `docs/guides/manual-install-codex.md` — step-by-step Codex installation guide:
  prerequisites, file mapping, AGENTS.md creation, model configuration (`o3`,
  `o4-mini`, `gpt-4o`), trigger phrases, skill activation, session management,
  and update procedure

**OpenCode agents: Codex model support**

- `presets/opencode/agents/orchestrator.md` — added Codex model rows: `gpt-5.2`
  (best, long-running agents), `gpt-5.5` (alternative, complex routing)
- `presets/opencode/agents/architect.md` — added Codex model rows: `gpt-5.5`
  (best, frontier for complex design), `gpt-5.4` (alternative)
- `presets/opencode/agents/implementer.md` — added Codex model rows:
  `gpt-5.3-codex` (best, coding-optimized), `gpt-5.4` (alternative)
- `presets/opencode/agents/tester.md` — added Codex model rows: `gpt-5.3-codex`
  (best, coding-optimized for test cases), `gpt-5.4` (alternative)
- `presets/opencode/agents/reviewer.md` — added Codex model rows: `gpt-5.4`
  (best, reliable diff analysis), `gpt-5.5` (alternative, security reviews)
- `presets/opencode/agents/task-coach.md` — added Codex model rows:
  `gpt-5.4-mini` (best, fast cost-efficient intake), `gpt-5.4` (alternative)
- `presets/opencode/agents/docs.md` — added Codex model rows: `gpt-5.4-mini`
  (best, fast for changelog/README), `gpt-5.4` (alternative)
- `presets/opencode/agents/repo-explorer.md` — added Codex model rows:
  `gpt-5.4-mini` (best, fast for file mapping), `gpt-5.4` (alternative)

**Commands and docs**

- `presets/claude/commands/cc/tdd-cycle.md` and
  `presets/opencode/commands/cc-tdd-cycle.md` — structured Red-Green-Refactor
  workflow with phase gates (RED report → GREEN report → REFACTOR report +
  Reviewer), enforcing strict TDD discipline
- `presets/claude/commands/cc/` — CodeConductor-namespaced aliases for all
  Claude preset commands (`/cc:feature`, `/cc:fix`, `/cc:refactor`,
  `/cc:review`, `/cc:test-plan`, `/cc:tdd-cycle`); enabled via Claude Code
  subdirectory namespacing
- `docs/complementary-tools.md` — reference for tools that operate in distinct
  layers alongside CodeConductor (Engram, Gentle AI, and ecosystem utilities)
- `SECURITY.md` — supported versions, current security model, and vulnerability
  reporting guidance
- `docs/security-model.md` — current guarantees, non-guarantees, trust
  boundaries, and planned runtime isolation
- `docs/current-limitations.md` — clarifies that CodeConductor has no runtime,
  CLI, policy compiler, or automated evaluation in v0.1.0
- `docs/cli-contract.md` and `docs/policy-schema.md` — future CLI and policy
  contracts defined before implementation
- `presets/opencode/skills/python/` — Python clean code patterns (naming, type
  hints, decorators, exceptions, service/repository patterns)
- `presets/opencode/skills/python-django-stack/` — Django conventions (FBV,
  service layer, JSON API shapes, pagination, PDF, cart, models)
- `presets/opencode/skills/django-orm/` — ORM patterns (N+1, select_related,
  bulk ops, transactions, multi-tenant upload paths)
- `presets/opencode/skills/django-testing/` — Django test constraints
  (SimpleTestCase + mocks for tenant apps, RequestFactory, FakeSession,
  MagicMock traps, queryset chain mocking)
- Same 4 Python/Django skills mirrored to `presets/claude/skills/`
- `docs/stacks/python-django-postgresql.md` — stack definition and reference
- `examples/python-django-postgresql/` — end-to-end feature example with Task
  Card and Technical Plan

### Changed

**OpenCode least-privilege role tools**

- `presets/opencode/agents/orchestrator.md`,
  `presets/opencode/agents/task-coach.md`,
  `presets/opencode/agents/architect.md`, and
  `presets/opencode/agents/reviewer.md` — frontmatter now disables write/edit
  tools for roles whose contracts are coordination, intake, design, or review
  only

**Context scope — new Task Card field and Scorecard metric**

- `docs/task-card-template.md` — added `context_scope` field: `isolated`
  (task-only, no prior context), `continuation` (relevant prior context), `full`
  (all session context); defaults to `isolated`
- `docs/agent-scorecard.md` — added `context_discipline` metric (0–3 scale)
  evaluating whether the agent respected the declared `context_scope`; score 2
  when no scope is declared
- `presets/opencode/agents/orchestrator.md` — added Context Scope handling
  table: maps `isolated` → `/new`, `continuation` → preserve context, `full` →
  full history
- `presets/opencode/agents/reviewer.md` — added `context discipline` review
  axis: checks whether `/new` was executed when `context_scope` was `isolated`
- `presets/opencode/agents/task-coach.md` — added `context_scope` as the 6th
  required Task Card field with intake question pattern
- `presets/opencode/prompts/v0.2.0/orchestrator.md`, `reviewer.md`,
  `task-coach.md` — same context_scope additions mirrored to versioned prompts

**OpenCode commands — cc: prefix**

- `presets/opencode/commands/` — all command files renamed to `cc-` prefix
  (`cc-feature.md`, `cc-fix.md`, `cc-refactor.md`, `cc-review.md`,
  `cc-test-plan.md`, `cc-tdd-cycle.md`) for consistency with Claude's `/cc:`
  namespace; invoked as `/cc:feature`, `/cc:fix`, etc. in OpenCode

**Python/Django stack support**

- `presets/opencode/opencode.jsonc` — added Python/Django bash patterns:
  `uv run pytest*`, `make tests*`, `make lint*`, `make verifymigrations*`,
  `uv run djlint --check*` to allow list; Django DB operations
  (`migrate_schemas`, `makemigrations`, `migrate`) added to ask list
- `presets/opencode/agents/orchestrator.md` — added Stack-Aware Skill Routing
  section: Python/Django detection signals, per-agent skill injection
  instructions, and TDD gate for medium/high risk tasks
- `presets/opencode/agents/tester.md` — added Python/Django Testing section:
  base class selection table (SimpleTestCase vs TestCase for tenant apps),
  Django runner commands, TDD sequence, module docstring requirement
- `presets/opencode/prompts/v0.2.0/` — new versioned prompt directory with
  updated orchestrator and tester contracts
- `docs/routing-policy.md` — added Django high-risk path patterns
  (`apps/*/migrations/**`, `config/settings*.py`, `apps/users/**`) and DRF
  public contract path (`apps/*/serializers.py`)
- `docs/prompt-versioning.md` — v0.1.0 marked deprecated, v0.2.0 added as active
- `presets/claude/CLAUDE.md` — added skill activation rules for the 4 new
  Python/Django skills

**Codex preset contract alignment**

- `presets/codex/AGENTS.md` — aligned the embedded routing table with the
  documented CodeConductor policy, added a self-contained Scorecard format, and
  changed skill activation instructions to use installed paths (`.codex/skills/`
  or `.opencode/skills/`) instead of a root `skills/` directory
- `presets/codex/README.md` — corrected installation and runtime guidance to
  distinguish Codex-only and Codex + OpenCode skill layouts
- `docs/guides/manual-install-codex.md` — removed the obsolete AGENTS skill-path
  rewrite step, fixed the AGENTS merge guidance, and updated the first-task
  walkthrough to reflect API-change routing plus Scorecard and human-review
  gates

**Scope corrections**

- `README.md` — states current pre-CLI scope, what works today, what is planned,
  and current security limitations
- `CLAUDE.md` — reflects repository's documentation-first and preset-based state
- `docs/architecture.md` and `ROADMAP.md` — separate implemented preset
  documentation from planned runtime security capabilities
- Version documentation now treats `package.json` `0.1.0` as the active
  canonical version

### Fixed

- `policy.yml` and OpenCode preset permissions now require confirmation for
  `git push`
- `policy.yml` — execution model labeled as target-tool-dependent instead of a
  CodeConductor-enforced sandbox

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
