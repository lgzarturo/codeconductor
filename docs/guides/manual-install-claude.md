# Manual Installation: CodeConductor Preset for Claude Code

**Framework version:** CodeConductor v0.1.0 **Target tool:** Claude Code
**Target stack:** Spring Boot 3.x + Kotlin + Gradle + PostgreSQL

This guide walks through installing the CodeConductor Claude Code preset into an
existing Spring Boot + Kotlin project. In v0.1.0 there is no CLI — installation
is a manual file copy operation.

> [!IMPORTANT] CodeConductor policies are declarative in v0.1.0. Runtime
> enforcement depends on Claude Code's permission system; CodeConductor does not
> provide its own sandbox, policy compiler, or OS-level isolation yet.

---

## 1. Prerequisites

Verify each item before starting. Installation will not produce a working setup
if any prerequisite is missing.

**Claude Code**

Install Claude Code following the official documentation at
[claude.ai/code](https://claude.ai/code). Verify it runs:

```bash
claude --version
```

**Kotlin and Spring Boot**

- Kotlin 1.9 or later
- Spring Boot 3.x
- `build.gradle.kts` in the project root (not `build.gradle`)

Verify:

```bash
./gradlew --version
```

**Project layout**

The preset assumes a feature-oriented package layout under
`src/main/kotlin/{your.base.package}/`. If your project uses a flat layout,
adjust the high-risk paths in Step 6.

Example expected layout:

```text
src/main/kotlin/com/example/myapp/
  product/
    ProductController.kt
    ProductService.kt
    ProductRepository.kt
  order/
  shared/
```

**Git**

Git must be initialized and the working tree must be clean. The preset policy
protects branches named `main`, `master`, and `develop`. At least one of these
must be the default branch.

```bash
git status        # should report "nothing to commit, working tree clean"
git branch        # confirm protected branch exists
```

---

## 2. What You Will Install

The table below maps every file from the CodeConductor repository to its
destination in your project. All paths are relative to the respective repository
roots.

```text
FROM (CodeConductor repo)                                      TO (your project root)
───────────────────────────────────────────────────────────────────────────────────────
presets/claude/CLAUDE.md                                    -> CLAUDE.md
presets/claude/settings.json                                -> .claude/settings.json
presets/claude/commands/feature.md                          -> .claude/commands/feature.md
presets/claude/commands/fix.md                              -> .claude/commands/fix.md
presets/claude/commands/refactor.md                         -> .claude/commands/refactor.md
presets/claude/commands/review.md                           -> .claude/commands/review.md
presets/claude/commands/test-plan.md                        -> .claude/commands/test-plan.md
presets/claude/skills/spring-boot-kotlin/SKILL.md           -> .claude/skills/spring-boot-kotlin/SKILL.md
presets/claude/skills/api-versioning/SKILL.md               -> .claude/skills/api-versioning/SKILL.md
presets/claude/skills/jpa-postgres/SKILL.md                 -> .claude/skills/jpa-postgres/SKILL.md
presets/claude/skills/testing-strategy/SKILL.md             -> .claude/skills/testing-strategy/SKILL.md
AGENTS.md (managed section)                                 -> AGENTS.md (merge with existing or create)
```

Total: 1 project instructions file, 1 settings file, 5 command definitions, 4
skill files, 1 AGENTS.md.

---

## 3. How This Preset Works

**Claude Code vs OpenCode — key difference**

OpenCode has runtime-level named agents (`@architect`, `@tester`). Claude Code
does not. Instead, the CodeConductor Claude preset embeds all agent contracts in
`CLAUDE.md`, which Claude Code loads automatically at session start.

When you run a command such as `/feature`, the command instructs Claude to adopt
each Conductor Agent role in sequence ("Adopt the Architect role as defined in
CLAUDE.md"). Claude applies the role's responsibilities and constraints for that
step, then transitions to the next role.

The behavior is equivalent. The mechanism is different.

**File roles**

| File                    | Purpose                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE.md`             | Defines all Conductor Agent roles, routing policy, and skill activation rules. Loaded automatically by Claude Code at session start. |
| `.claude/settings.json` | Permission allowlist and denylist — controls which shell commands Claude Code may run automatically vs. which require confirmation.  |
| `.claude/commands/*.md` | Slash commands — `/feature`, `/fix`, `/refactor`, `/review`, `/test-plan`. Each orchestrates the full workflow for its task type.    |
| `.claude/skills/*.md`   | Domain knowledge files activated automatically when the task context matches (Spring Boot, JPA, API versioning, testing).            |
| `AGENTS.md`             | Shared conventions file — read by all AI tools, not just Claude Code.                                                                |

---

## 4. Step-by-Step Installation

### Step 1 — Obtain CodeConductor

Clone the repository to a temporary location:

```bash
git clone https://github.com/lgzarturo/codeconductor /tmp/codeconductor
```

If a tagged release is available, prefer downloading the release archive from
GitHub Releases and extracting it to `/tmp/codeconductor`. This gives you a
known-good snapshot tied to a version rather than the current HEAD.

### Step 2 — Create the directory structure in your project

Run these commands from your project root:

```bash
mkdir -p .claude/commands
mkdir -p .claude/skills/spring-boot-kotlin
mkdir -p .claude/skills/api-versioning
mkdir -p .claude/skills/jpa-postgres
mkdir -p .claude/skills/testing-strategy
```

### Step 3 — Copy the preset files

Run these commands from your project root, substituting `/tmp/codeconductor`
with the actual path where you placed the CodeConductor repository:

```bash
# Project instructions
cp /tmp/codeconductor/presets/claude/CLAUDE.md ./CLAUDE.md

# Settings (permissions)
cp /tmp/codeconductor/presets/claude/settings.json ./.claude/settings.json

# Command definitions (5 files)
cp /tmp/codeconductor/presets/claude/commands/feature.md   .claude/commands/feature.md
cp /tmp/codeconductor/presets/claude/commands/fix.md       .claude/commands/fix.md
cp /tmp/codeconductor/presets/claude/commands/refactor.md  .claude/commands/refactor.md
cp /tmp/codeconductor/presets/claude/commands/review.md    .claude/commands/review.md
cp /tmp/codeconductor/presets/claude/commands/test-plan.md .claude/commands/test-plan.md

# Skills (4 directories)
cp /tmp/codeconductor/presets/claude/skills/spring-boot-kotlin/SKILL.md .claude/skills/spring-boot-kotlin/SKILL.md
cp /tmp/codeconductor/presets/claude/skills/api-versioning/SKILL.md     .claude/skills/api-versioning/SKILL.md
cp /tmp/codeconductor/presets/claude/skills/jpa-postgres/SKILL.md       .claude/skills/jpa-postgres/SKILL.md
cp /tmp/codeconductor/presets/claude/skills/testing-strategy/SKILL.md   .claude/skills/testing-strategy/SKILL.md
```

### Step 4 — Customize CLAUDE.md

Open `CLAUDE.md` in your editor. These sections require adjustment.

**Base package**

At the bottom of the Skills section, the preset references generic paths. Add
your project's base package to make the skill activation rules precise:

```markdown
## Project Context

Base package: `com.example.myapp` Build tool: Gradle (Kotlin DSL) Database:
PostgreSQL 15
```

**High-risk paths**

Add a section to CLAUDE.md that lists your project's sensitive paths. Claude
Code uses this to flag or request extra confirmation when edits are proposed to
these paths:

```markdown
## High-Risk Paths

The following paths contain sensitive logic. Propose changes here only after
explicit human review and approval:

- `src/main/kotlin/**/security/**`
- `src/main/kotlin/**/auth/**`
- `src/main/kotlin/**/payment/**`
- `src/main/resources/db/migration/**`
- `src/main/resources/application-prod.yml`
```

Adjust the glob patterns to match your package structure. If your security
package is at `com.example.myapp.infrastructure.security`, the pattern is:

```markdown
- `src/main/kotlin/**/infrastructure/security/**`
```

**Model note**

Claude Code uses the model configured in your Claude Code account settings or
passed via CLI flag. There is no model field in the preset files. If you need
per-session model selection, use the `--model` flag when starting Claude Code:

```bash
claude --model claude-opus-4-7   # for architecture-heavy sessions
claude --model claude-sonnet-4-6 # default for implementation
```

### Step 5 — Customize settings.json

Open `.claude/settings.json`. The following fields require adjustment.

**Build and test commands**

The preset includes `./gradlew test*` and `./gradlew build*` in the allow list.
If your project uses a custom task name, adjust these entries. Commands not in
the allow list will require interactive confirmation each time Claude Code
attempts to run them.

```json
"allow": [
  "Bash(git status*)",
  "Bash(git diff*)",
  "Bash(git log*)",
  "Bash(./gradlew test*)",
  "Bash(./gradlew build*)",
  "Bash(./gradlew check*)",
  "Bash(npm test*)",
  "Bash(npm run lint*)"
]
```

**Deny list review**

The preset ships a conservative deny list. Review it and confirm it matches your
team's constraints. Do not remove entries from the deny list without a specific,
documented reason.

### Step 6 — Create or update AGENTS.md

**If AGENTS.md does not exist in your project:**

Copy the file from the CodeConductor repository:

```bash
cp /tmp/codeconductor/AGENTS.md ./AGENTS.md
```

**If AGENTS.md already exists in your project:**

The managed section is delimited by two markers:

```text
<!-- CODECONDUCTOR:BEGIN managed -->
<!-- CODECONDUCTOR:END managed -->
```

If these markers are not present, append the entire managed section from the
CodeConductor `AGENTS.md` to the bottom of your existing file. The section
starts at `<!-- CODECONDUCTOR:BEGIN managed -->` and ends at
`<!-- CODECONDUCTOR:END managed -->`.

Do not modify the content between the markers manually. That section is owned by
CodeConductor and will be overwritten on each update. Use the
`## Project-Specific Notes` section below the markers for your own additions.

To extract only the managed section from the CodeConductor file:

```bash
# Print the managed block to stdout so you can review it before appending
awk '/CODECONDUCTOR:BEGIN managed/,/CODECONDUCTOR:END managed/' /tmp/codeconductor/AGENTS.md
```

Append it to your existing `AGENTS.md`:

```bash
echo "" >> ./AGENTS.md
awk '/CODECONDUCTOR:BEGIN managed/,/CODECONDUCTOR:END managed/' /tmp/codeconductor/AGENTS.md >> ./AGENTS.md
```

### Step 7 — Verify installation (manual doctor check)

`codeconductor doctor` is planned for v0.2.0 and is not available yet. Use this
checklist to confirm the installation is complete and correct.

Run each check from your project root:

```bash
# Project instructions file present
ls CLAUDE.md

# Settings file present
ls .claude/settings.json

# Command definitions — must list exactly 5 files
ls .claude/commands/

# Skills — must list exactly 4 directories
ls .claude/skills/

# Each skill must have its SKILL.md
ls .claude/skills/spring-boot-kotlin/SKILL.md
ls .claude/skills/api-versioning/SKILL.md
ls .claude/skills/jpa-postgres/SKILL.md
ls .claude/skills/testing-strategy/SKILL.md

# AGENTS.md must exist and contain the managed markers
grep "CODECONDUCTOR:BEGIN managed" AGENTS.md
grep "CODECONDUCTOR:END managed" AGENTS.md

# Build must succeed
./gradlew build

# Claude Code must start without errors
claude --version
```

Expected state for each check:

- [ ] `CLAUDE.md` exists in project root
- [ ] `.claude/settings.json` exists
- [ ] `.claude/commands/` contains 5 `.md` files
- [ ] `.claude/skills/` contains 4 directories
- [ ] Each skill directory has a `SKILL.md` file
- [ ] `AGENTS.md` contains both `CODECONDUCTOR:BEGIN managed` and
      `CODECONDUCTOR:END managed`
- [ ] `./gradlew build` exits with code 0
- [ ] `claude --version` exits with code 0

If any check fails, do not proceed. Fix the issue before starting Claude Code.

---

## 5. Running Your First Task

This section walks through a concrete scenario using the installed workflow.

### Scenario: add a new REST endpoint

You need to add `GET /api/v1/products` with pagination and a name filter.

**Step 1 — Open Claude Code in your project root**

```bash
cd your-project/
claude
```

**Step 2 — If the request is well-defined, use the feature command**

```text
/feature add GET /api/v1/products endpoint with pagination and a name filter. It should accept page, size, and name query parameters. Results must be pageable.
```

The `/feature` command triggers the full workflow automatically: Task Coach →
Architect → Implementer → Tester → Reviewer → Docs (if needed).

Each step pauses for human confirmation before continuing to the next.

**Step 3 — If the request is vague, describe it and let Task Coach clarify**

```text
/feature products endpoint with pagination
```

The Task Coach role will ask clarifying questions and produce a Task Card. Do
not proceed past the Task Card step until the card is complete and confirmed.

**Step 4 — Review the Technical Plan before implementation**

When the Architect role produces a Technical Plan, read it. If it does not match
your intent, tell Claude what to change before confirming. The Implementer role
will follow this plan exactly.

**Step 5 — Monitor implementation**

Claude Code will ask for confirmation before modifying files (default behavior).
Review each proposed change before approving.

---

## 6. Using Commands

Commands are slash commands that trigger the appropriate workflow for their task
type.

| Command                  | When to use                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `/feature [description]` | New functionality. Runs the full workflow: Task Coach (if needed) → Architect → Implementer → Tester → Reviewer.               |
| `/fix [bug description]` | Bug fix. Routes based on risk: low risk goes directly to Implementer; medium-high risk adds Architect and Reviewer.            |
| `/refactor [scope]`      | Refactor. Always starts with Architect regardless of risk.                                                                     |
| `/review`                | Before committing or opening a PR. Produces a structured findings report with CRITICAL / WARNING / SUGGESTION severity levels. |
| `/test-plan [scope]`     | Plan tests before implementation. Produces a test matrix for the specified scope without writing test code.                    |

**Difference from OpenCode:** Claude Code does not have runtime-level named
agents. Commands instruct Claude to adopt each role in sequence within the same
session. The workflow is equivalent — Task Coach validates, Architect designs,
Implementer writes, Tester verifies, Reviewer gates — but expressed as role
adoption rather than agent invocation.

---

## 7. Conductor Agent Role Reference

| Role          | Adopted when                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| Orchestrator  | Task requires multiple roles, routing is unclear, or you want a complete plan before any implementation starts. |
| Task Coach    | Request is vague, acceptance criteria are missing, or risk cannot be classified without more information.       |
| Architect     | Need a design decision, ADR, module boundary change, API contract, or data model change.                        |
| Implementer   | Technical Plan is accepted and the implementation scope is clear.                                               |
| Tester        | New behavior was introduced, a bug was fixed, or a refactor carries behavioral risk.                            |
| Reviewer      | Before committing or opening a pull request.                                                                    |
| Docs          | Public API changed, new module was added, or existing documentation is incorrect.                               |
| Repo Explorer | You need to understand the codebase before starting a task or need to locate the impact radius of a change.     |

All roles are defined in `CLAUDE.md`. You can invoke a role directly by
describing what you need in plain language:

```text
Act as the Architect and design the approach for adding a soft-delete flag to the User entity.
```

---

## 8. Customizing for Your Project

### Adding project-specific skills

Create a new directory under `.claude/skills/` and add a `SKILL.md` file:

```bash
mkdir -p .claude/skills/your-project-conventions
touch .claude/skills/your-project-conventions/SKILL.md
```

Minimum `SKILL.md` structure:

```markdown
# Skill: Your Project Conventions

## When this skill applies

[Describe the context or file types where these rules apply]

## Rules

- [Rule 1 — concrete and actionable]
- [Rule 2]
- [Rule 3]

## Examples

[Optional: show a before/after or a pattern to follow]
```

Reference the skill in `CLAUDE.md` under the Skills section:

```markdown
When working with [context], apply
`.claude/skills/your-project-conventions/SKILL.md`.
```

### Modifying role behavior

Edit the `CLAUDE.md` file directly. The agent role definitions are in the
**Conductor Agent Roles** section. Changes here apply immediately to the next
Claude Code session.

Do not modify `presets/claude/CLAUDE.md` in the CodeConductor repository. That
is the canonical preset. Your local `CLAUDE.md` is your authoritative copy —
customize it freely.

### Adding project context

Add a `## Project Context` section to `CLAUDE.md` with project-specific
conventions all roles should know: base package name, naming conventions,
team-specific rules, external service dependencies.

Example:

```markdown
## Project Context

- Base package: `com.example.myapp`
- Database: PostgreSQL 15 with Flyway migrations
- API versioning: URL prefix (`/api/v1/`)
- Auth: JWT via Spring Security, tokens in Authorization header
- External services: Stripe (payments), SendGrid (email)
- Team conventions: all public API changes require an ADR
```

---

## 9. What Not to Do

**Do not use the Implementer role without an accepted Technical Plan.** The
Implementer follows a plan. Without one, it invents architecture — and that
invention will be inconsistent with the rest of the codebase.

**Do not push directly from within a Claude Code session.** The settings deny
`git push --force*` and `git push -f*` outright. Use your normal Git workflow
for pushing; let Claude Code handle code changes only.

**Do not expand permissions in `settings.json` without justification.** The
default posture is restrictive by design. Every permission expansion increases
the blast radius of a mistake. If Claude Code cannot do its job within the
current permissions, investigate why — do not simply add an allow rule.

**Do not use the Architect role for implementation tasks.** The Architect
designs. It does not write production code. Asking it to implement produces
unpredictable results.

**Do not skip the routing to go faster.** The routing policy exists because
different task types carry different risks. Skipping Architect for an API
contract change or skipping Reviewer before a merge does not save time — it
moves the cost to the incident that follows.

**Do not store secrets in any file Claude Code can read.** Keep secrets in a
secrets manager entirely outside the project directory. Never place credentials
in files that are part of the working directory.

---

## 10. Updating the Preset

When a new version of CodeConductor is released:

**Step 1 — Review the CHANGELOG**

Read `CHANGELOG.md` in the CodeConductor repository. Identify which files
changed between your installed version and the new version. Not all updates
require copying all files.

**Step 2 — Fetch the new version**

```bash
git -C /tmp/codeconductor fetch --tags
git -C /tmp/codeconductor checkout tags/v0.2.0   # substitute the actual tag
```

Or download the release archive and extract it to `/tmp/codeconductor`.

**Step 3 — Copy updated files selectively**

Copy only the files that changed according to the CHANGELOG. Use the same `cp`
commands from Step 3 of the installation, targeting only the updated files.

**Step 4 — Merge CLAUDE.md changes**

The preset ships a new `CLAUDE.md` on role contract updates. Diff it against
your current `CLAUDE.md`:

```bash
diff ./CLAUDE.md /tmp/codeconductor/presets/claude/CLAUDE.md
```

Merge the sections that changed (Conductor Agent Roles, Routing Policy) while
preserving your customizations (Project Context, High-Risk Paths, Skills
additions).

**Step 5 — Update the AGENTS.md managed section**

```bash
# Review what changed
diff <(awk '/CODECONDUCTOR:BEGIN managed/,/CODECONDUCTOR:END managed/' ./AGENTS.md) \
     <(awk '/CODECONDUCTOR:BEGIN managed/,/CODECONDUCTOR:END managed/' /tmp/codeconductor/AGENTS.md)
```

If the diff is acceptable, replace the managed section in your file.

**What is preserved across updates:**

- Your `## Project Context` and `## High-Risk Paths` sections in `CLAUDE.md`
- Your custom skill additions to `CLAUDE.md`'s Skills section
- Your `.claude/settings.json` allow/deny customizations
- `.claude/skills/` files you created
- The `## Project-Specific Notes` section in your `AGENTS.md`

**What is not preserved:**

- Edits inside
  `<!-- CODECONDUCTOR:BEGIN managed --> ... <!-- CODECONDUCTOR:END managed -->`
  — treat this block as read-only

**Versioned contracts are immutable:**

If the update ships a new prompt version (e.g., `prompts/v0.2.0/`), do not
delete or overwrite `prompts/v0.1.0/`. Versioned prompts are append-only.
