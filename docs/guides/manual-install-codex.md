# Manual Installation: Codex Preset

**Framework version:** CodeConductor v0.1.0
**Target tool:** OpenAI Codex CLI

This guide walks through installing the CodeConductor Codex preset into an
existing project. In v0.1.0 there is no CLI — installation is a manual file
copy operation.

> [!IMPORTANT]
> CodeConductor policies are declarative in v0.1.0. Runtime enforcement depends
> on Codex's permission model; CodeConductor does not provide its own sandbox,
> policy compiler, or OS-level isolation yet.

> [!NOTE]
> The Codex preset differs architecturally from the Claude and OpenCode presets.
> Codex has no named agent files and no slash commands. All 8 agent contracts are
> embedded in a single `AGENTS.md`. Workflows are triggered by natural language
> phrases instead of `/commands`.

---

## 1. Prerequisites

Verify each item before starting. Installation will not produce a working setup
if any prerequisite is missing.

**Codex CLI**

Install Codex CLI following the official OpenAI documentation. Verify it runs:

```bash
codex --version
```

**An OpenAI API key**

Codex requires an active OpenAI API key. Set it in your environment:

```bash
export OPENAI_API_KEY="sk-..."
```

Add this to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) to persist it
across sessions.

**Git**

Git must be initialized and the working tree must be clean. The preset policy
protects branches named `main`, `master`, and `develop`. At least one of these
must be the default branch.

```bash
git status        # should report "nothing to commit, working tree clean"
git branch        # confirm protected branch exists
```

---

## 2. Project Layout: Codex-only vs. Combined

Before installing, determine which setup applies to your project.

### Option A — Codex only

Your project uses Codex as the only AI coding tool. Skills go in `.codex/skills/`
at the project root. `AGENTS.md` references them via relative paths.

```text
your-project/
├── AGENTS.md                  ← CodeConductor instructions (all 8 agents)
└── .codex/
    └── skills/
        ├── testing-strategy/SKILL.md
        ├── spring-boot-kotlin/SKILL.md
        └── ...                ← install only the skills relevant to your stack
```

### Option B — Codex + OpenCode (combined)

Your project already has the OpenCode preset installed. Codex can reference the
same skill files from `.opencode/skills/` — no duplication needed. Only
`AGENTS.md` needs to be added.

```text
your-project/
├── AGENTS.md                  ← NEW: CodeConductor instructions for Codex
├── opencode.jsonc             ← existing OpenCode config
├── .opencode/
│   ├── agents/                ← existing OpenCode named agents
│   ├── commands/              ← existing OpenCode commands
│   └── skills/                ← existing skills — Codex references these directly
│       ├── testing-strategy/SKILL.md
│       ├── spring-boot-kotlin/SKILL.md
│       └── ...
└── .codex/                    ← optional: Codex-specific config only
    └── (no skills/ needed — use .opencode/skills/ directly)
```

This works because skill files are tool-agnostic: each `SKILL.md` declares
`tools: [claude, codex, opencode]` in its frontmatter. The path Codex uses to
reference them is just a relative path in `AGENTS.md`.

---

## 3. What You Will Install

### Option A — Codex only

```text
FROM (CodeConductor repo)                                   TO (your project root)
──────────────────────────────────────────────────────────────────────────────────────
presets/codex/AGENTS.md                                  -> AGENTS.md
presets/codex/skills/api-versioning/SKILL.md             -> .codex/skills/api-versioning/SKILL.md
presets/codex/skills/django-orm/SKILL.md                 -> .codex/skills/django-orm/SKILL.md
presets/codex/skills/django-testing/SKILL.md             -> .codex/skills/django-testing/SKILL.md
presets/codex/skills/jpa-postgres/SKILL.md               -> .codex/skills/jpa-postgres/SKILL.md
presets/codex/skills/python/SKILL.md                     -> .codex/skills/python/SKILL.md
presets/codex/skills/python-django-stack/SKILL.md        -> .codex/skills/python-django-stack/SKILL.md
presets/codex/skills/python-fastapi-stack/SKILL.md       -> .codex/skills/python-fastapi-stack/SKILL.md
presets/codex/skills/spring-boot-feature/SKILL.md        -> .codex/skills/spring-boot-feature/SKILL.md
presets/codex/skills/spring-boot-kotlin/SKILL.md         -> .codex/skills/spring-boot-kotlin/SKILL.md
presets/codex/skills/sqlalchemy/SKILL.md                 -> .codex/skills/sqlalchemy/SKILL.md
presets/codex/skills/testing-strategy/SKILL.md           -> .codex/skills/testing-strategy/SKILL.md
```

Total: 1 `AGENTS.md`, up to 11 skill files (install only the ones for your stack).

### Option B — Codex + OpenCode

```text
FROM (CodeConductor repo)                                   TO (your project root)
──────────────────────────────────────────────────────────────────────────────────────
presets/codex/AGENTS.md                                  -> AGENTS.md
```

Total: 1 file. Skills already exist in `.opencode/skills/` — use those same
installed paths when invoking skills from Codex. No duplication needed.

---

## 4. Step-by-Step Installation

### Step 1 — Obtain CodeConductor

Clone the repository to a temporary location:

```bash
git clone https://github.com/lgzarturo/codeconductor /tmp/codeconductor
```

If a tagged release is available, prefer downloading the release archive from
GitHub Releases and extracting it to `/tmp/codeconductor`.

---

### Step 2A — Codex only: create the `.codex/` directory structure

Run these commands from your project root. Install only the skills relevant to
your stack — you do not need all 11.

```bash
# Spring Boot + Kotlin stack
mkdir -p .codex/skills/spring-boot-kotlin
mkdir -p .codex/skills/spring-boot-feature
mkdir -p .codex/skills/jpa-postgres
mkdir -p .codex/skills/api-versioning
mkdir -p .codex/skills/testing-strategy

# Python / Django stack
mkdir -p .codex/skills/python
mkdir -p .codex/skills/python-django-stack
mkdir -p .codex/skills/django-orm
mkdir -p .codex/skills/django-testing

# Python / FastAPI + SQLAlchemy stack
mkdir -p .codex/skills/python-fastapi-stack
mkdir -p .codex/skills/sqlalchemy
```

### Step 3A — Codex only: copy the skill files

```bash
# Spring Boot + Kotlin stack
cp /tmp/codeconductor/presets/codex/skills/spring-boot-kotlin/SKILL.md   .codex/skills/spring-boot-kotlin/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/spring-boot-feature/SKILL.md  .codex/skills/spring-boot-feature/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/jpa-postgres/SKILL.md         .codex/skills/jpa-postgres/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/api-versioning/SKILL.md       .codex/skills/api-versioning/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/testing-strategy/SKILL.md     .codex/skills/testing-strategy/SKILL.md

# Python / Django stack
cp /tmp/codeconductor/presets/codex/skills/python/SKILL.md               .codex/skills/python/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/python-django-stack/SKILL.md  .codex/skills/python-django-stack/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/django-orm/SKILL.md           .codex/skills/django-orm/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/django-testing/SKILL.md       .codex/skills/django-testing/SKILL.md

# Python / FastAPI + SQLAlchemy stack
cp /tmp/codeconductor/presets/codex/skills/python-fastapi-stack/SKILL.md .codex/skills/python-fastapi-stack/SKILL.md
cp /tmp/codeconductor/presets/codex/skills/sqlalchemy/SKILL.md           .codex/skills/sqlalchemy/SKILL.md
```

---

### Step 2B — Codex + OpenCode: no skill setup needed

Skills are already in `.opencode/skills/`. Skip to Step 4.

---

### Step 4 — Create or update AGENTS.md

**If AGENTS.md does not exist in your project:**

```bash
cp /tmp/codeconductor/presets/codex/AGENTS.md ./AGENTS.md
```

**If AGENTS.md already exists:**

Merge the CodeConductor sections manually. Keep one authoritative `AGENTS.md`
per directory scope. Do not append duplicate copies of the agent contracts.

After merging, verify the file contains all 8 agent role sections:

```bash
grep "^### " AGENTS.md
```

Expected output includes: `orchestrator`, `task-coach`, `architect`,
`implementer`, `tester`, `reviewer`, `docs`, `repo-explorer`.

---

### Step 5 — Skill activation uses the installed path

No `AGENTS.md` rewrite is required. The Codex preset documents both supported
skill locations:

- Codex-only: invoke skills from `.codex/skills/`
- Codex + OpenCode: invoke skills from `.opencode/skills/`

Examples:

```text
Apply the testing-strategy skill from .codex/skills/testing-strategy/SKILL.md.
```

```text
Apply the testing-strategy skill from .opencode/skills/testing-strategy/SKILL.md.
```

In the combined setup, skills stay in one place. No files are copied and no
directories are created under `.codex/skills/`.

---

### Step 6 — Configure your preferred model (optional)

Codex has no project-level configuration file. Model selection is global.

Create or edit `~/.codex/config.toml`:

```toml
model = "o4-mini"
```

Alternatively, pass the model per session:

```bash
codex --model o3
```

Recommended models by role:

| Role | Model | Reason |
|------|-------|--------|
| Architect, Orchestrator | `o3` | Complex reasoning, routing decisions |
| Implementer, Tester, Reviewer | `o4-mini` | Balanced, cost-effective |
| Task Coach, Docs, Repo Explorer | `gpt-4o` | Fast, conversational |

Codex does not support per-agent model assignment in the same session. Choose
the model that matches the primary agent you plan to use for that session, or
use `o4-mini` as a general-purpose default.

---

### Step 7 — Verify installation (manual doctor check)

`codeconductor doctor` is planned for v0.2.0 and is not available yet. Use this
checklist to confirm the installation is complete and correct.

```bash
# AGENTS.md must exist at project root
ls AGENTS.md

# Must contain all 8 agent role sections
grep "^### orchestrator"   AGENTS.md
grep "^### task-coach"     AGENTS.md
grep "^### architect"      AGENTS.md
grep "^### implementer"    AGENTS.md
grep "^### tester"         AGENTS.md
grep "^### reviewer"       AGENTS.md
grep "^### docs"           AGENTS.md
grep "^### repo-explorer"  AGENTS.md

# Codex-only: verify skill files are in .codex/
ls .codex/skills/

# Codex + OpenCode: verify skills are still in .opencode/
ls .opencode/skills/

# Codex must start without errors
codex --version
```

Expected state:

- [ ] `AGENTS.md` exists in project root
- [ ] All 8 agent sections are present in `AGENTS.md`
- [ ] Skill files exist at the path referenced in `AGENTS.md` (`.codex/skills/` or `.opencode/skills/`)
- [ ] `codex --version` exits with code 0

---

## 5. Running Your First Task

### Scenario: add a new REST endpoint

You need to add `GET /api/v1/products` with pagination and a name filter.

**Step 1 — Open Codex in your project root**

```bash
cd your-project/
codex
```

**Step 2 — Well-defined request: use the feature workflow trigger**

```text
Run the feature workflow for: add GET /api/v1/products with pagination and a
name filter — accepts page, size, and name query parameters.
```

Codex reads `AGENTS.md` and follows the orchestrator contract. Because this
adds a public endpoint, it should classify the task as an API change and route
it through `architect` → `implementer` → `reviewer`, with tests run before the
Deliverable is accepted and human review before merge.

**Step 3 — Vague request: start with task-coach**

```text
Act as the task-coach agent. Help me define a Task Card for: add a products
endpoint with pagination.
```

The task-coach will ask clarifying questions and produce a Task Card. Do not
proceed until the Task Card is complete.

**Step 4 — Architect designs the approach**

```text
Act as the architect agent. Design the technical approach for this Task Card:
[paste Task Card here]
```

**Step 5 — Review the Technical Plan**

Read the output. If it does not match your intent, correct the architect before
continuing. The implementer will follow this plan exactly.

**Step 6 — Implement**

```text
Act as the implementer agent. Execute this Technical Plan:
[paste Technical Plan here]
```

The implementer must run the relevant project tests before declaring the task
complete.

**Step 7 — Review before committing**

```text
Act as the reviewer agent. Review the current changes against this Task Card:
[paste Task Card here]
```

Address `CRITICAL` and `WARNING` findings before merging.

**Step 8 — Record the Scorecard and stop for human review**

Use the Scorecard format embedded in `AGENTS.md` to record the Deliverable
quality. Do not merge on `REVISE` or `REJECT`.

---

## 6. Trigger Phrases

Codex has no slash command system. Use these natural language phrases:

| Workflow | Trigger phrase |
|----------|---------------|
| Full feature | `Run the feature workflow for: [description]` |
| Bug fix | `Run the fix workflow for: [description]` |
| Refactor | `Run the refactor workflow for: [scope]` |
| Code review | `Run a structured review of: [target]` |
| Test plan | `Create a test plan for: [scope]` |
| Task intake | `Help me define a Task Card for: [vague request]` |
| Codebase map | `Explore the codebase and produce a Repo Map` |

For individual agent invocation:

```text
Act as the [agent-name] agent. [your instruction]
```

---

## 7. Agent Reference Card

| Agent | Recommended model | Invoke when |
|-------|------------------|-------------|
| orchestrator | `o3` | Task requires multiple agents, routing is unclear, or you want a complete plan before implementation starts. |
| task-coach | `gpt-4o` | Request is vague, acceptance criteria are missing, or risk cannot be classified. |
| architect | `o3` | Need a design decision, ADR, module boundary change, API contract, or data model. |
| implementer | `o4-mini` | Technical Plan is accepted and implementation scope is clear. |
| tester | `o4-mini` | New behavior was introduced, a bug was fixed, or a refactor carries behavioral risk. |
| reviewer | `o4-mini` | Before committing or opening a pull request. |
| docs | `gpt-4o` | Public API changed, new module was added, or existing documentation is incorrect. |
| repo-explorer | `gpt-4o` | You need to understand the codebase or locate the impact radius of a change. |

---

## 8. Skill Activation

Skills are activated explicitly. Codex does not auto-discover them.

**Codex-only (skills in `.codex/skills/`):**

```text
Apply the testing-strategy skill from .codex/skills/testing-strategy/SKILL.md.
Then act as the tester agent and write tests for: [task]
```

**Codex + OpenCode (skills in `.opencode/skills/`):**

```text
Apply the testing-strategy skill from .opencode/skills/testing-strategy/SKILL.md.
Then act as the tester agent and write tests for: [task]
```

At session start, to prime the context for the whole session:

```text
Read .codex/skills/spring-boot-kotlin/SKILL.md and apply those rules to all
code you write in this session.
```

Available skills:

| Skill | When to activate |
|-------|-----------------|
| `testing-strategy` | Writing or reviewing tests for Spring Boot + Kotlin |
| `spring-boot-kotlin` | Spring Boot + Kotlin features and patterns |
| `spring-boot-feature` | Step-by-step Spring Boot feature creation |
| `jpa-postgres` | JPA queries, PostgreSQL, bulk operations |
| `api-versioning` | REST API versioning and deprecation workflows |
| `python` | Python clean code conventions |
| `python-django-stack` | Django views, services, models, endpoints |
| `django-orm` | Django ORM queries, bulk operations, migrations |
| `django-testing` | Django test patterns, tenant-aware testing |
| `python-fastapi-stack` | FastAPI routers, endpoints, schemas |
| `sqlalchemy` | SQLAlchemy models, sessions, Alembic migrations |

---

## 9. Context Scope and Session Management

The CodeConductor workflow uses a `Context Scope` field in each Task Card:

| Context scope | Meaning | Action |
|---------------|---------|--------|
| `isolated` | Task should start with no prior context | Close and reopen Codex before starting |
| `continuation` | Task continues a previous conversation | Keep the same Codex session open |
| `full` | Task needs all prior context | Keep the same session and reference prior output |

Codex has no `/new` command equivalent to OpenCode. For `isolated` tasks, the
only way to clear context is to start a new session. This is the default for
most CodeConductor task types.

For multi-step tasks across sessions, use `continuation` and paste the relevant
prior output — Task Card, Technical Plan, or Implementation Summary — at the
start of each new session to restore context.

---

## 10. Differences from Claude and OpenCode Presets

| Feature | Claude Code | OpenCode | Codex |
|---------|-------------|----------|-------|
| Config file | `CLAUDE.md` | `opencode.jsonc` + `agents/*.md` | `AGENTS.md` only |
| Named agents | `.claude/commands/cc/*.md` | `.opencode/agents/*.md` | Embedded in `AGENTS.md` |
| Slash commands | `/cc:feature`, `/cc:fix`, etc. | `/cc:feature`, `/cc:fix`, etc. | Not supported — use trigger phrases |
| Session reset | `/clear` | `/new` | Close and reopen session |
| Models | Anthropic (`claude-*`) | Anthropic or Chinese providers | OpenAI (`o3`, `o4-mini`, `gpt-4o`) |
| Permission config | `settings.json` | `opencode.jsonc` | `~/.codex/config.toml` (global only) |
| Project-level config | yes | yes | no |
| Skills location | `.claude/skills/` | `.opencode/skills/` | `.codex/skills/` or `.opencode/skills/` |
| Skills format | `SKILL.md` | `SKILL.md` | `SKILL.md` (same format) |

---

## 11. Combined Setup Reference (Codex + OpenCode)

If your project uses both Codex and OpenCode, this is the minimal diff from a
fully-installed OpenCode project:

```bash
# Step 1 — Copy AGENTS.md only
cp /tmp/codeconductor/presets/codex/AGENTS.md ./AGENTS.md

# Step 2 — Done. No new skill files, no new directories.
# Invoke skills from .opencode/skills/ when you need them.
```

Both tools then use the same skill files. When a skill is updated in
`.opencode/skills/`, Codex gets the update automatically on next session — no
sync step required.

The only file unique to each tool:

| Tool | Unique files |
|------|-------------|
| OpenCode | `opencode.jsonc`, `.opencode/agents/*.md`, `.opencode/commands/*.md` |
| Codex | `AGENTS.md` |
| Shared | `.opencode/skills/*/SKILL.md` |

---

## 12. What Not to Do

**Do not invoke the implementer without an accepted Technical Plan.** Without
one, it invents architecture inconsistent with the rest of the codebase.

**Do not push directly from Codex.** The `AGENTS.md` hard rules deny
`git push --force*` outright. Standard `git push` requires explicit
confirmation. Use your normal Git workflow for pushing.

**Do not skip routing to go faster.** Skipping the architect for an API
contract change or skipping the reviewer before a merge moves the cost to the
incident that follows.

**Do not store secrets in any file Codex can read.** Hard rules in `AGENTS.md`
deny reads on `.env`, `.env.*`, `secrets/**`, and common credential paths. Keep
secrets in a secrets manager entirely outside the project directory.

**Do not duplicate skill files when using both Codex and OpenCode.** Invoke
skills directly from `.opencode/skills/` instead. Duplication creates drift —
the two copies will diverge on updates.

---

## 13. Updating the Preset

**Step 1 — Review the CHANGELOG**

Read `CHANGELOG.md` in the CodeConductor repository. Not all updates require
copying all files.

**Step 2 — Fetch the new version**

```bash
git -C /tmp/codeconductor fetch --tags
git -C /tmp/codeconductor checkout tags/v0.2.0   # substitute the actual tag
```

**Step 3 — Update AGENTS.md**

Review the diff:

```bash
diff ./AGENTS.md /tmp/codeconductor/presets/codex/AGENTS.md
```

If your `AGENTS.md` contains only CodeConductor content, replace it entirely:

```bash
cp /tmp/codeconductor/presets/codex/AGENTS.md ./AGENTS.md
```

If it contains project-specific additions, merge the updated CodeConductor
sections carefully and keep using the installed skill paths from Step 5.

**Step 4 — Update skill files (Codex-only setup)**

```bash
# Copy only the skill files that changed per CHANGELOG
cp /tmp/codeconductor/presets/codex/skills/testing-strategy/SKILL.md .codex/skills/testing-strategy/SKILL.md
```

**Codex + OpenCode combined setup:** update skill files via the OpenCode update
procedure — Codex picks up the changes automatically.

**What is preserved across updates:**

- Project-specific additions in `AGENTS.md` outside the CodeConductor sections
- Custom skill files created in `.codex/skills/`
- Your global `~/.codex/config.toml`

**What is not preserved:**

- Edits made inside CodeConductor-owned agent sections of `AGENTS.md` — treat
  those sections as read-only; keep project customizations in a separate section
  at the top or bottom of the file
