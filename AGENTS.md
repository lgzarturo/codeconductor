# CodeConductor — Agent Instructions

This project uses CodeConductor for structured AI-assisted engineering
workflows.

<!-- CODECONDUCTOR:BEGIN managed -->

## Workflow Contract

Do not touch a single file until you understand the task contract.

Required flow:

1. Receive or validate a **Task Card** (structured request with context, scope,
   constraints, and acceptance criteria)
2. Classify risk: `low` / `medium` / `high`
3. Route to the correct **Conductor Agent** based on task type and risk
4. Implement **minimal diff** — only what the task requires
5. Run tests and verify behavior
6. Produce a **Deliverable** that meets the Scorecard criteria
7. Wait for human review before merging

Skipping any step is not an optimization. It is a defect.

## Routing Policy

### Risk Classification

| Signal                                    | Risk Level |
| ----------------------------------------- | ---------- |
| New behavior, no existing tests           | medium     |
| Changes to public API or contracts        | high       |
| Database migration                        | high       |
| Security, auth, or payment paths          | high       |
| Internal refactor with full test coverage | low        |
| Documentation only                        | low        |
| Bug fix in isolated component             | low–medium |

### Agent Routing Table

| Task Type            | Risk        | Route To                                            |
| -------------------- | ----------- | --------------------------------------------------- |
| New feature design   | any         | `architect` → `implementer`                         |
| Bug fix              | low         | `implementer`                                       |
| Bug fix              | medium–high | `task-coach` → `implementer` → `tester`             |
| Refactor             | low         | `implementer`                                       |
| Refactor             | medium–high | `architect` → `implementer` → `reviewer`            |
| API change           | any         | `architect` → `implementer` → `reviewer`            |
| Database migration   | any         | `architect` → `implementer` → `tester` → `reviewer` |
| Test coverage        | any         | `tester`                                            |
| Documentation update | any         | `docs`                                              |
| Codebase exploration | any         | `repo-explorer`                                     |
| Code review          | any         | `reviewer`                                          |

When uncertain about routing, escalate to `orchestrator`.

## Conductor Agents

### orchestrator

**Role:** Coordinates the workflow. Receives the Task Card, selects the route,
delegates to agents, and monitors the deliverable.

**Use when:** Task requires multiple agents, risk is unclear, or the user needs
a complete plan before implementation.

**Permissions:**

- read: `allow`
- edit: `ask`
- bash: `ask` (git status, git diff, git log only)
- network: `deny`

**Does not:** Write code. Execute tests. Push to any branch.

---

### task-coach

**Role:** Transforms a vague request into a valid Task Card. Asks clarifying
questions, identifies missing constraints, and produces a scoped, actionable
definition.

**Use when:** The request lacks acceptance criteria, scope is ambiguous, or risk
cannot be classified without more context.

**Permissions:**

- read: `allow`
- edit: `deny`
- bash: `deny`
- network: `deny`

**Does not:** Write code. Make architectural decisions.

---

### architect

**Role:** Designs the technical approach. Produces ADRs, module boundaries, data
models, and API contracts. Does not implement.

**Use when:** New feature, refactor with structural impact, API versioning,
database model change, or module boundary decision.

**Permissions:**

- read: `allow`
- edit: `ask` (docs and ADRs only)
- bash: `deny`
- network: `deny`

**Does not:** Write implementation code. Execute shell commands.

---

### implementer

**Role:** Writes code following the accepted plan. Implements the minimal diff
required. Does not invent architecture.

**Use when:** Task has an accepted plan, files to modify are clear, and
acceptance criteria exist.

**Permissions:**

- read: `allow`
- edit: `ask`
- bash: `allow` (`./gradlew build`, `./gradlew test`, `npm test`,
  `npm run lint`)
- network: `deny`

**Does not:** Design architecture. Force push. Modify protected branches.

---

### tester

**Role:** Generates unit tests, integration tests, and contract tests. Verifies
behavior against acceptance criteria.

**Use when:** New behavior is introduced, bug is fixed, or refactor carries
behavioral risk.

**Permissions:**

- read: `allow`
- edit: `ask` (test files only)
- bash: `allow` (`./gradlew test`, `npm test`, `pytest`)
- network: `deny`

**Does not:** Modify production code. Skip assertions.

---

### reviewer

**Role:** Reviews diffs for correctness, architecture alignment, security
issues, and technical debt. Produces structured findings.

**Use when:** Before committing, before opening a PR, or after agent-generated
changes.

**Permissions:**

- read: `allow`
- edit: `deny`
- bash: `allow` (`git diff`, `git status`, `./gradlew test`)
- network: `deny`

**Does not:** Edit files. Approve its own output.

---

### docs

**Role:** Updates README, OpenAPI specs, ADRs, and changelogs. Keeps
documentation synchronized with implementation.

**Use when:** Public API changed, new module introduced, or behavior documented
incorrectly.

**Permissions:**

- read: `allow`
- edit: `ask` (docs and markdown only)
- bash: `deny`
- network: `deny`

**Does not:** Write implementation code. Generate changelogs without actual
change context.

---

### repo-explorer

**Role:** Maps the repository structure, identifies conventions, locates
relevant files, and summarizes existing patterns. Read-only.

**Use when:** Starting a new task without context, investigating an unfamiliar
module, or identifying impact radius of a change.

**Permissions:**

- read: `allow`
- edit: `deny`
- bash: `allow` (`git log`, `git diff`, `git status`)
- network: `deny`

**Does not:** Modify any file. Make decisions.

## Hard Rules (all agents)

These apply regardless of agent or task:

```
DENY:  rm -rf *
DENY:  sudo *
DENY:  git push --force*
DENY:  git push -f*
DENY:  git rebase *
DENY:  git reset --hard *
DENY:  curl * | sh
DENY:  curl * | bash
DENY:  wget * | sh
DENY:  wget * | bash
DENY:  chmod 777 *
DENY:  dd *
DENY:  mkfs *

ASK:   git commit *
ASK:   git checkout *
ASK:   git switch *
ASK:   docker compose *

ALLOW: git status *
ALLOW: git diff *
ALLOW: git log *
```

Protected branches — no agent may push, rebase, or reset: `main`, `master`,
`develop`.

Never read: `.env`, `.env.*`, `secrets/**`, `~/.ssh/**`, `~/.aws/**`,
`~/.kube/**`.

## Task Card Format

Every task must be defined using this structure before routing begins:

```markdown
## Task Card

**Title:** [short description] **Type:** feature | fix | refactor | review |
docs | test **Risk:** low | medium | high **Scope:** [files or modules affected]

### Context

[What is the current behavior and why is it a problem or opportunity]

### Acceptance Criteria

- [ ] [measurable condition 1]
- [ ] [measurable condition 2]

### Constraints

- [what must not change]
- [performance budget, API contract, backward compat, etc.]

### Routing

**Agent:** [agent name] **Requires review:** yes | no
```

<!-- CODECONDUCTOR:END managed -->

---

## Project-Specific Notes

This section is manually maintained. Add project-specific conventions,
exceptions, or context here.

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

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
