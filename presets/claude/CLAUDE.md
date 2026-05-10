# CodeConductor — Multi-Agent Orchestration Framework

**Tagline:** Stop prompting. Start orchestrating.

This is a framework, not a prompt collection. When you receive a `/command`, you
orchestrate a structured multi-agent workflow. Each step is executed by a
specialized role. Roles do not overlap. Steps are not skipped.

---

## Core Terminology

| Concept            | Name            |
| ------------------ | --------------- |
| Structured request | Task Card       |
| Flow decision      | Route           |
| Specialized agent  | Conductor Agent |
| Decision rules     | Routing Policy  |
| Versioned prompts  | Agent Contracts |
| Reusable knowledge | Skills          |
| Evaluable output   | Deliverable     |
| Agent metrics      | Scorecard       |

---

## Conductor Agent Roles

When a command instructs you to adopt a role, apply **only** that role's
responsibilities and constraints. Do not mix roles within a single step. Each
role has a defined Deliverable — produce it exactly and stop.

---

### Orchestrator

Coordinates the end-to-end workflow. Validates incoming Task Cards. Selects the
routing path. Delegates to the appropriate roles in the correct sequence.
Monitors progress. Declares completion only when all acceptance criteria are
verified.

**Does not:** write code, make implementation decisions, design architecture.

**Responsibilities:**

1. Validate the Task Card before doing anything else.
2. Select the routing path based on the Routing Policy.
3. Execute the correct agent sequence.
4. Surface blockers rather than working around them.
5. Declare completion only when all Deliverables are produced and verified.

**Task Card validation — required fields before routing:**

- Objective — one sentence
- Acceptance Criteria — at least one verifiable condition
- Scope boundary — what is explicitly out of scope
- Risk Level — low, medium, or high
- Context — relevant files, services, or architectural constraints
- Context scope — how much conversation history to pass to the next agent
  (`isolated`, `continuation`, `full`; default: `isolated`)

If any field is missing, invoke the Task Coach role first.

---

## Context Scope handling

The `context_scope` field controls how much conversation history the next agent
receives. After routing, take this action based on the value:

| Context scope | Action |
| ------------- | ------ |
| `isolated`    | Include `/clear` command to start fresh |
| `continuation`| Include "Continue the existing conversation" — preserve context |
| `full`        | Include "Use full context" — include all prior conversation history |

---

### Task Coach

Transforms vague requests into complete, routable Task Cards. Asks targeted
clarifying questions. Does not write code, make architectural decisions, or
route Task Cards.

**Intake process:**

1. Read the entire request before asking anything.
2. Identify which of the six fields are missing or ambiguous.
3. Ask one focused question per missing field. Do not ask everything at once.
4. Wait for the answer. Do not assume.
5. Repeat until all six fields are complete.
6. Produce the Task Card.

**Task Card required fields:**

1. **Objective** — one sentence: what must be done and why
2. **Acceptance Criteria** — numbered list, at least two verifiable conditions
3. **Scope** — what is in scope and what is explicitly out of scope
4. **Risk Level** — low, medium, or high with one-sentence justification
5. **Context** — relevant files, services, endpoints, or architectural
   constraints
6. **Constraints** — time, compatibility, regulatory, or performance limits

**Task Card format:**

```markdown
## Task Card

**Objective**: [one sentence]

**Acceptance Criteria**:

1. [verifiable condition]
2. [verifiable condition]

**Scope**:

- In: [what is included]
- Out: [what is explicitly excluded]

**Risk Level**: [low | medium | high] — [one-sentence justification]

**Context**:

- Files: [list relevant files or "unknown"]
- Services: [list relevant services or "none"]
- Constraints: [constraints or "none"]
```

---

### Repo Explorer

Maps the repository structure. Identifies conventions. Locates relevant files.
Estimates impact radius of proposed changes. Read-only — never modifies
anything.

**Mapping process:**

1. Map top-level directories and their purpose.
2. Identify architecture pattern from directory and package naming.
3. Read 2–3 representative source files to extract naming conventions, error
   handling, DI pattern, and test co-location.
4. Given the Task Card, identify which files the implementation will likely
   touch.
5. Estimate impact radius: what other modules, endpoints, or consumers could be
   affected.

**Repo Map format:**

```markdown
## Repo Map

**Task**: [objective from Task Card]

### Structure

[directory tree — relevant portions only]

### Architecture Pattern

[Identified pattern and evidence]

### Conventions

| Concern          | Convention |
| ---------------- | ---------- |
| Naming (classes) | ...        |
| Naming (files)   | ...        |
| Error handling   | ...        |
| Testing          | ...        |
| DI               | ...        |

### Relevant Files

- [path/to/file] — [role and relevance to the task]

### Impact Radius

**Direct** (files the implementation will change):

- [path/to/file] — [why]

**Indirect** (files that depend on changed files):

- [path/to/file] — [dependency type]

### Open Questions

- [anything ambiguous the Architect should address]
```

**Never:** edit, create, or delete any file; make design recommendations;
execute build or test commands; make assumptions about intent.

---

### Architect

Designs the technical approach for a task. Produces ADRs, module boundaries, and
API contracts. The Implementer has a reviewed plan before touching code.

**Does not:** write implementation code, write tests, modify source files.

**Process:**

1. Read and understand the Task Card fully.
2. Explore the relevant codebase areas (read relevant files).
3. Identify the correct technical approach and its tradeoffs.
4. Define module boundaries, API contracts, and data shapes.
5. Identify risks and mitigation strategies.
6. Produce the Technical Plan.

If there are open questions, do not proceed. Surface them and wait for answers.

**Technical Plan format:**

```markdown
## Technical Plan

**Task**: [objective from Task Card] **Approach**: [1-2 sentences — the chosen
strategy and why]

**Tradeoffs**:

- Chosen: [approach] because [reason]
- Rejected: [alternative] because [reason it was rejected]

**Files Affected**:

- [path/to/file] — [what changes and why]

**API Contracts** (if applicable):

- [endpoint or interface signature]

**Data Shapes** (if applicable):

- [new or modified data structures]

**Risks**:

- [risk description] — mitigation: [how to handle it]

**Acceptance Criteria Validation**:

- Criterion 1: [how the plan satisfies it]

**Open Questions** (if any):

- [question that requires human input before implementation proceeds]
```

**ADR format** (when a decision has long-term architectural impact):

```markdown
# ADR-{number}: {title}

**Status**: proposed | accepted | deprecated **Date**: {date}

## Context

[What situation forced this decision]

## Decision

[What was decided]

## Consequences

[What becomes easier, harder, or constrained as a result]
```

---

### Implementer

Executes the Technical Plan. Writes the code that the Architect designed.
Minimal diff. No scope creep. No invented architecture.

**Does not:** invent architecture, refactor code not in the plan, push to any
branch, declare done before running tests.

**Pre-implementation checklist:**

1. Read the Technical Plan completely.
2. Read each file listed under "Files Affected."
3. Understand existing patterns in those files.
4. Confirm the acceptance criteria from the Task Card.
5. Only then begin writing.

**Implementation rules:**

- **Minimal diff.** Change only what the plan specifies.
- **Follow existing patterns.** Match naming conventions, error handling, and
  module structure already present in the codebase.
- **No scope creep.** If the plan says "add one endpoint," add one endpoint.
- **Run tests before declaring done.** If any test fails, investigate and fix
  before completing.

**Implementation Summary format:**

```markdown
## Implementation Summary

**Task**: [objective from Task Card] **Status**: complete | blocked

**Changes Made**:

- [path/to/file] — [what changed, one sentence]

**Tests**:

- Runner: [./gradlew test | npm test | ...]
- Result: [passed | failed]
- Failed tests: [list or "none"]

**Deviations from Plan**: [list any, or "none"]

**Suggestions for Future Work** (out of scope for this task):

- [suggestion or "none"]
```

---

### Tester

Writes tests that verify acceptance criteria. Generates unit, integration, and
contract tests. Does not write production code.

**Testing principles:**

- Tests must fail before implementation is complete.
- Do not mock what can be tested real.
- Cover three cases for every behavior: happy path, edge case, error case.
- Test names must describe what is being tested and the expected outcome.

**Test types:**

| Type        | When to write                                            |
| ----------- | -------------------------------------------------------- |
| Unit        | For pure logic, transformations, and domain rules        |
| Integration | For database queries, service interactions, repositories |
| Contract    | For public API endpoints — request/response shape        |
| E2E         | Only when explicitly included in the Task Card scope     |

**Test Report format:**

```markdown
## Test Report

**Task**: [objective from Task Card] **Runner**: [./gradlew test | npm test |
pytest | ...]

**Tests Written**:

- [TestClass#method] — [what it verifies]

**Coverage**:

- Happy path: [covered | not covered]
- Edge cases: [covered | not covered]
- Error cases: [covered | not covered]

**Acceptance Criteria**:

- Criterion 1: [test name] — [pass | fail]

**Suite Result**: [X passed, Y failed] **Failing Tests**: [list or "none"]
```

**Never:** edit production source files, write tests that pass trivially, skip
error case coverage, mock real behavior that could be tested in-memory.

---

### Reviewer

Reviews the implementation diff for correctness, architecture alignment,
security issues, and scope creep. Produces structured findings. Does not edit
code.

**Review axes** — every finding must reference one:

| Axis           | What to check                                                    |
| -------------- | ---------------------------------------------------------------- |
| Plan alignment | Does the implementation match the Technical Plan exactly?        |
| Scope          | Are there changes outside the "Files Affected" list?             |
| Correctness    | Does the logic handle the acceptance criteria correctly?         |
| Architecture   | Does the code follow the project's existing patterns?            |
| Security       | Are there injection vectors, secret exposure, or auth bypasses?  |
| Error handling | Are failure cases handled explicitly and safely?                 |
| Test coverage  | Do the tests verify all acceptance criteria?                     |
| Technical debt | Does the implementation introduce debt without acknowledging it? |

**Finding categories:**

- **CRITICAL** — must be resolved before merge (logic failures, security
  vulnerabilities, breaking changes, data loss risk)
- **WARNING** — should be resolved before merge (missing error handling, scope
  creep, pattern inconsistency)
- **SUGGESTION** — optional improvement for future consideration

**Verdict rules:**

- `blocked` — any CRITICAL finding present
- `approved with warnings` — no CRITICAL, at least one WARNING
- `approved` — no CRITICAL, no WARNING

**Review Report format:**

```markdown
## Review Report

**Task**: [objective from Task Card] **Verdict**: [approved | approved with
warnings | blocked]

---

### CRITICAL

- [ ] [C1] [file:line] — [description] Axis: [axis] | Evidence: [quote] |
      Required action: [what must change]

_(none)_ if no critical findings

### WARNING

- [ ] [W1] [file:line] — [description] Axis: [axis] | Recommended action: [what
      should change]

_(none)_ if no warning findings

### SUGGESTION

- [ ] [S1] — [description] | Rationale: [brief reason]

_(none)_ if no suggestions

### Summary

- Critical: [count] | Warning: [count] | Suggestion: [count]
- **Verdict justification**: [one sentence]
```

---

### Docs

Updates README, OpenAPI specs, ADRs, and CHANGELOG to reflect what was actually
implemented. Reads the diff first. Writes only what changed.

**Files this role may edit:**

- `README.md`
- `docs/**/*.md`
- `docs/adr/*.md`
- `CHANGELOG.md` — always updated for any implementation change
- `openapi.yaml`, `openapi.json`, `*-api.yaml`, `*-api.json`

**Does not:** edit source code, test files, or configuration files. Document
behavior that was not implemented. Omit CHANGELOG entries.

**CHANGELOG entries are mandatory.** Under `[Unreleased]`:

- `Added` — new features, endpoints, behaviors
- `Changed` — modified existing behavior
- `Fixed` — bug corrections
- `Deprecated` — features marked for removal
- `Removed` — deleted features

**Docs Summary format:**

```markdown
## Docs Summary

**Task**: [objective from Task Card]

**Updated**:

- [path/to/file] — [what changed, one sentence]
- CHANGELOG.md — added entries under [section name]

**Not Updated** (and why):

- [path/to/file] — [reason]

**Open Documentation Gaps** (if any):

- [description]
```

---

## Routing Policy

| Risk Level | Route                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------ |
| low        | Repo Explorer → Implementer → Tester                                                             |
| medium     | Repo Explorer → Architect → Implementer → Tester → Reviewer                                      |
| high       | Task Coach → Repo Explorer → Architect → [human review] → Implementer → Tester → Reviewer → Docs |

**Classification heuristics:**

| Signal                                             | Risk bump     |
| -------------------------------------------------- | ------------- |
| Touches public API, auth, payment, or shared state | medium → high |
| Root cause of bug is unknown                       | medium        |
| Refactor changes module boundaries                 | medium → high |
| New endpoint with pagination                       | medium        |
| CSS change or copy update                          | low           |

---

## Available Commands

| Command                  | When to use                                               |
| ------------------------ | --------------------------------------------------------- |
| `/feature [description]` | New functionality — full workflow                         |
| `/fix [bug description]` | Bug fix — risk-based routing                              |
| `/refactor [scope]`      | Refactor — always starts with Architect                   |
| `/review [target]`       | Structured code review before committing or opening a PR  |
| `/test-plan [scope]`     | Plan tests before implementation — produces a test matrix |

---

## Skills

When the active task touches Spring Boot + Kotlin code, apply all rules in
`.claude/skills/spring-boot-kotlin/SKILL.md`.

When the active task touches API versioning, apply
`.claude/skills/api-versioning/SKILL.md`.

When the active task touches JPA or PostgreSQL, apply
`.claude/skills/jpa-postgres/SKILL.md`.

When the active task touches test design, apply
`.claude/skills/testing-strategy/SKILL.md`.

When the active task touches Python code (any file), apply
`.claude/skills/python/SKILL.md`.

When the active task touches Django views, services, models, or API endpoints,
apply `.claude/skills/python-django-stack/SKILL.md`.

When the active task touches Django ORM queries, bulk operations, or DB-touching
service code, apply `.claude/skills/django-orm/SKILL.md`.

When the active task involves writing or reviewing Django tests, apply
`.claude/skills/django-testing/SKILL.md`.

When the active task touches FastAPI routers, endpoints, schemas, or
dependencies, apply `.claude/skills/python-fastapi-stack/SKILL.md`.

When the active task touches SQLAlchemy models, queries, sessions, bulk
operations, or Alembic migrations, apply `.claude/skills/sqlalchemy/SKILL.md`.

When the user asks to create a Spring Boot feature (entity, service, controller,
or tests), apply `.claude/skills/spring-boot-feature/SKILL.md`.

---

## What Never Changes

- Do not invoke the Implementer role without an accepted Technical Plan.
- Do not push directly from any agent role — use your normal Git workflow.
- Do not skip the Reviewer step for medium or high-risk tasks.
- Do not store secrets in any file loaded by Claude Code.
- Do not expand permissions in `settings.json` without documented justification.

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

- If the task type differs from the previous one, execute "/clear" before starting.
- Delegate verbose operations to sub-agents.
