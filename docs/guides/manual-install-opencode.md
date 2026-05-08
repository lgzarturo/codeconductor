# Manual Installation: OpenCode Preset for Spring Boot + Kotlin

**Framework version:** CodeConductor v0.1.0 **Target tool:** OpenCode **Target
stack:** Spring Boot 3.x + Kotlin + Gradle + PostgreSQL

This guide walks through installing the CodeConductor OpenCode preset into an
existing Spring Boot + Kotlin project. In v0.1.0 there is no CLI — installation
is a manual file copy operation.

> [!IMPORTANT]
> CodeConductor policies are declarative in v0.1.0. Runtime enforcement depends
> on OpenCode's permission system; CodeConductor does not provide its own
> sandbox, policy compiler, or OS-level isolation yet.

---

## 1. Prerequisites

Verify each item before starting. Installation will not produce a working setup
if any prerequisite is missing.

**OpenCode**

Install OpenCode following the official documentation at
[opencode.ai](https://opencode.ai). Verify it runs:

```bash
opencode --version
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
adjust the `highRiskPaths` in Step 6.

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
FROM (CodeConductor repo)                                   TO (your project root)
────────────────────────────────────────────────────────────────────────────────────
presets/opencode/opencode.jsonc                          -> opencode.jsonc
presets/opencode/agents/orchestrator.md                  -> .opencode/agents/orchestrator.md
presets/opencode/agents/task-coach.md                    -> .opencode/agents/task-coach.md
presets/opencode/agents/architect.md                     -> .opencode/agents/architect.md
presets/opencode/agents/implementer.md                   -> .opencode/agents/implementer.md
presets/opencode/agents/tester.md                        -> .opencode/agents/tester.md
presets/opencode/agents/reviewer.md                      -> .opencode/agents/reviewer.md
presets/opencode/agents/docs.md                          -> .opencode/agents/docs.md
presets/opencode/agents/repo-explorer.md                 -> .opencode/agents/repo-explorer.md
presets/opencode/commands/feature.md                     -> .opencode/commands/feature.md
presets/opencode/commands/fix.md                         -> .opencode/commands/fix.md
presets/opencode/commands/refactor.md                    -> .opencode/commands/refactor.md
presets/opencode/commands/review.md                      -> .opencode/commands/review.md
presets/opencode/commands/test-plan.md                   -> .opencode/commands/test-plan.md
presets/opencode/skills/spring-boot-kotlin/SKILL.md      -> .opencode/skills/spring-boot-kotlin/SKILL.md
presets/opencode/skills/api-versioning/SKILL.md          -> .opencode/skills/api-versioning/SKILL.md
presets/opencode/skills/jpa-postgres/SKILL.md            -> .opencode/skills/jpa-postgres/SKILL.md
presets/opencode/skills/testing-strategy/SKILL.md        -> .opencode/skills/testing-strategy/SKILL.md
AGENTS.md (managed section)                              -> AGENTS.md (merge with existing or create)
```

Total: 1 config file, 8 agent contracts, 5 command definitions, 4 skill files, 1
AGENTS.md.

---

## 3. Step-by-Step Installation

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
mkdir -p .opencode/agents
mkdir -p .opencode/commands
mkdir -p .opencode/skills/spring-boot-kotlin
mkdir -p .opencode/skills/api-versioning
mkdir -p .opencode/skills/jpa-postgres
mkdir -p .opencode/skills/testing-strategy
```

### Step 3 — Copy the preset files

Run these commands from your project root, substituting `/tmp/codeconductor`
with the actual path where you placed the CodeConductor repository:

```bash
# Configuration file
cp /tmp/codeconductor/presets/opencode/opencode.jsonc ./opencode.jsonc

# Agent contracts (8 files)
cp /tmp/codeconductor/presets/opencode/agents/orchestrator.md  .opencode/agents/orchestrator.md
cp /tmp/codeconductor/presets/opencode/agents/task-coach.md    .opencode/agents/task-coach.md
cp /tmp/codeconductor/presets/opencode/agents/architect.md     .opencode/agents/architect.md
cp /tmp/codeconductor/presets/opencode/agents/implementer.md   .opencode/agents/implementer.md
cp /tmp/codeconductor/presets/opencode/agents/tester.md        .opencode/agents/tester.md
cp /tmp/codeconductor/presets/opencode/agents/reviewer.md      .opencode/agents/reviewer.md
cp /tmp/codeconductor/presets/opencode/agents/docs.md          .opencode/agents/docs.md
cp /tmp/codeconductor/presets/opencode/agents/repo-explorer.md .opencode/agents/repo-explorer.md

# Command definitions (5 files)
cp /tmp/codeconductor/presets/opencode/commands/feature.md   .opencode/commands/feature.md
cp /tmp/codeconductor/presets/opencode/commands/fix.md       .opencode/commands/fix.md
cp /tmp/codeconductor/presets/opencode/commands/refactor.md  .opencode/commands/refactor.md
cp /tmp/codeconductor/presets/opencode/commands/review.md    .opencode/commands/review.md
cp /tmp/codeconductor/presets/opencode/commands/test-plan.md .opencode/commands/test-plan.md

# Skills (4 directories)
cp /tmp/codeconductor/presets/opencode/skills/spring-boot-kotlin/SKILL.md .opencode/skills/spring-boot-kotlin/SKILL.md
cp /tmp/codeconductor/presets/opencode/skills/api-versioning/SKILL.md     .opencode/skills/api-versioning/SKILL.md
cp /tmp/codeconductor/presets/opencode/skills/jpa-postgres/SKILL.md       .opencode/skills/jpa-postgres/SKILL.md
cp /tmp/codeconductor/presets/opencode/skills/testing-strategy/SKILL.md   .opencode/skills/testing-strategy/SKILL.md
```

### Step 4 — Customize opencode.jsonc

Open `opencode.jsonc` in your editor. The following fields require adjustment
before use.

**model**

The default is `claude-sonnet-4-5`. If your OpenCode account has access to a
newer model, update this value. Do not change individual agent models without a
specific reason — the agents share this default.

```jsonc
"model": "claude-sonnet-4-6",
```

**bash allow list — build and test commands**

The preset includes `./gradlew test*` and `./gradlew build*` in the allow list.
If your project uses wrapper-free Gradle or a custom task name, adjust these
entries. Agents will not be able to run tests without a matching allow entry.

```jsonc
"allow": [
  "git status*",
  "git diff*",
  "git log*",
  "./gradlew test*",
  "./gradlew build*",
  "./gradlew check*",    // add if you use the check lifecycle task
  "npm test*",
  "npm run lint*"
]
```

**webfetch and websearch**

Both default to `ask`. This is correct for most projects. If agents frequently
need to fetch OpenAPI specs or external documentation, you may relax `webfetch`
to `allow` for specific domains — but do this deliberately and document why.

### Step 5 — Create or update AGENTS.md

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

### Step 6 — Configure high-risk paths

Open `opencode.jsonc`. Add a `highRiskPaths` field that reflects your project's
actual sensitive paths. These paths trigger extra confirmation from agents when
edits are proposed.

```jsonc
// Add this inside the "permission" object, after the "skill" block
"highRiskPaths": [
  "src/main/kotlin/**/security/**",
  "src/main/kotlin/**/auth/**",
  "src/main/kotlin/**/payment/**",
  "src/main/resources/db/migration/**",
  "src/main/resources/application-prod.yml"
]
```

Adjust the glob patterns to match your package structure. If your security
package is at `com.example.myapp.infrastructure.security`, the pattern is:

```jsonc
"src/main/kotlin/**/infrastructure/security/**"
```

### Step 7 — Verify installation (manual doctor check)

`codeconductor doctor` is planned for v0.2.0 and is not available yet. Use this
checklist to confirm the installation is complete and correct.

Run each check from your project root:

```bash
# Config file present
ls opencode.jsonc

# Agent contracts — must list exactly 8 files
ls .opencode/agents/

# Command definitions — must list exactly 5 files
ls .opencode/commands/

# Skills — must list exactly 4 directories
ls .opencode/skills/

# Each skill must have its SKILL.md
ls .opencode/skills/spring-boot-kotlin/SKILL.md
ls .opencode/skills/api-versioning/SKILL.md
ls .opencode/skills/jpa-postgres/SKILL.md
ls .opencode/skills/testing-strategy/SKILL.md

# AGENTS.md must exist and contain the managed markers
grep "CODECONDUCTOR:BEGIN managed" AGENTS.md
grep "CODECONDUCTOR:END managed" AGENTS.md

# Build must succeed
./gradlew build

# OpenCode must start without errors
opencode --version
```

Expected state for each check:

- [ ] `opencode.jsonc` exists in project root
- [ ] `.opencode/agents/` contains 8 `.md` files
- [ ] `.opencode/commands/` contains 5 `.md` files
- [ ] `.opencode/skills/` contains 4 directories
- [ ] Each skill directory has a `SKILL.md` file
- [ ] `AGENTS.md` contains both `CODECONDUCTOR:BEGIN managed` and
      `CODECONDUCTOR:END managed`
- [ ] `./gradlew build` exits with code 0
- [ ] `opencode --version` exits with code 0

If any check fails, do not proceed. Fix the issue before running OpenCode.

---

## 4. Running Your First Task

This section walks through a concrete scenario using the installed workflow.

### Scenario: add a new REST endpoint

You need to add `GET /api/v1/products` with pagination and a name filter.

**Step 1 — Open OpenCode in your project root**

```bash
cd your-project/
opencode
```

**Step 2 — If the request is well-defined, send it to the orchestrator**

```text
@orchestrator I need to add a GET /api/v1/products endpoint with pagination and a name filter. It should accept page, size, and name query parameters. Results must be pageable.
```

The orchestrator will classify the risk and route to the appropriate agents.

**Step 3 — If the request is vague, start with task-coach**

If you are not sure about scope, acceptance criteria, or constraints:

```text
@task-coach I need a products endpoint with pagination
```

The task-coach will ask clarifying questions and produce a Task Card. Do not
proceed until the Task Card is complete.

**Step 4 — Architect designs the approach**

Paste the Task Card from the previous step:

```text
@architect [paste Task Card here]
```

The architect will produce a Technical Plan: module boundaries, data model
changes if any, API contract, and an assessment of impact on existing code. Do
not skip this step for new endpoints.

**Step 5 — Review the Technical Plan before implementation**

Read the Technical Plan output. If it does not match your intent, tell the
architect what to change before continuing. The implementer will follow this
plan exactly.

**Step 6 — Implement**

```text
@implementer [paste Technical Plan here]
```

The implementer writes the minimal diff. It will ask for confirmation before
modifying files, because the default edit permission is `ask`.

**Step 7 — Test**

```text
@tester [paste Task Card and implementation summary here]
```

The tester generates unit tests and integration tests against the acceptance
criteria in the Task Card.

**Step 8 — Review before committing**

```text
@reviewer [describe the change or ask it to review current git diff]
```

The reviewer produces a structured findings report. Address `CRITICAL` and
`WARNING` findings before merging.

**Alternative: use a command shortcut**

Commands bundle the full workflow into a single invocation:

```text
/feature add paginated products endpoint with name filter
```

The `/feature` command triggers the orchestrator, which runs the full
`architect -> implementer -> tester -> reviewer` route automatically.

---

## 5. Using Commands

Commands are shorthand invocations that trigger the appropriate agent route
without manually selecting agents.

| Command                  | When to use                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `/feature [description]` | New functionality. Runs the full workflow: task-coach (if needed) -> architect -> implementer -> tester -> reviewer.           |
| `/fix [bug description]` | Bug fix. Routes based on risk: low risk goes directly to implementer; medium-high risk adds task-coach and tester.             |
| `/refactor [scope]`      | Refactor. Always starts with architect regardless of risk.                                                                     |
| `/review`                | Before committing or opening a PR. Produces a structured findings report with CRITICAL / WARNING / SUGGESTION severity levels. |
| `/test-plan [scope]`     | Plan tests before implementation. Produces a test matrix for the specified scope without writing test code.                    |

Commands call agents on your behalf. You can always invoke agents directly if
you need more control over a specific step.

---

## 6. Agent Reference Card

| Agent            | Default model             | Invoke when                                                                                                      |
| ---------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@orchestrator`  | claude-sonnet-4-6         | Task requires multiple agents, routing is unclear, or you want a complete plan before any implementation starts. |
| `@task-coach`    | claude-haiku-4-5-20251001 | Request is vague, acceptance criteria are missing, or risk cannot be classified without more information.        |
| `@architect`     | claude-opus-4-7           | Need a design decision, ADR, module boundary change, API contract, or data model.                                |
| `@implementer`   | claude-sonnet-4-6         | Technical Plan is accepted and the implementation scope is clear.                                                |
| `@tester`        | claude-sonnet-4-6         | New behavior was introduced, a bug was fixed, or a refactor carries behavioral risk.                             |
| `@reviewer`      | claude-sonnet-4-6         | Before committing or opening a pull request.                                                                     |
| `@docs`          | claude-haiku-4-5-20251001 | Public API changed, new module was added, or existing documentation is incorrect.                                |
| `@repo-explorer` | claude-haiku-4-5-20251001 | You need to understand the codebase before starting a task or need to locate the impact radius of a change.      |

Per-agent model overrides can be set in the agent contract frontmatter inside
`.opencode/agents/{agent}.md`. The global `model` field in `opencode.jsonc` is
the default.

---

## 7. Customizing for Your Project

### Adding project-specific skills

Create a new directory under `.opencode/skills/` and add a `SKILL.md` file:

```bash
mkdir -p .opencode/skills/your-project-conventions
touch .opencode/skills/your-project-conventions/SKILL.md
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

OpenCode loads skills automatically when the agent determines they are relevant
to the current task. Reference the skill name in the agent's conversation if you
want to force its activation.

### Modifying agent behavior

Edit the agent contract file directly in `.opencode/agents/{agent}.md`. These
are your local copies — changes here are local to your project and will not be
overwritten unless you explicitly run the update process described in Section 9.

Do not modify `presets/opencode/prompts/v0.1.0/` in the CodeConductor
repository. Those are the canonical versioned contracts. Local customizations
belong only in `.opencode/agents/`.

### Adding project instructions

Use the `instructions` field in `opencode.jsonc` to load additional context
files at startup:

```jsonc
"instructions": [
  "AGENTS.md",
  ".opencode/PROJECT_CONTEXT.md"
]
```

Create `.opencode/PROJECT_CONTEXT.md` with project-specific conventions that all
agents should know: base package name, naming conventions, team-specific rules,
external service dependencies, and anything that is not captured in the skill
files.

---

## 8. What Not to Do

**Do not invoke `@implementer` without an accepted Technical Plan.** The
implementer follows a plan. Without one, it invents architecture — and that
invention will be inconsistent with the rest of the codebase.

**Do not push directly from OpenCode.** The configuration denies
`git push --force*` and `git push -f*` outright. Standard `git push` is not in
the allow list and requires explicit confirmation. Use your normal Git workflow
for pushing; let OpenCode handle the code changes only.

**Do not expand permissions in `opencode.jsonc` without justification.** The
default posture is restrictive by design. Every permission expansion increases
the blast radius of an agent mistake. If an agent cannot do its job within the
current permissions, investigate why — do not simply add an allow rule.

**Do not use `@architect` for implementation tasks.** The architect does not
write production code. Asking it to implement is asking it to operate outside
its contract, which produces unpredictable results.

**Do not skip the routing to go faster.** The routing policy exists because
different task types carry different risks. Skipping `@architect` for an API
contract change or skipping `@reviewer` before a merge does not save time — it
moves the cost to the incident that follows.

**Do not store secrets in any file OpenCode can read.** The config denies reads
on `.env`, `.env.*`, and `secrets/**`. Do not place credentials in other
locations and expect the deny list to protect you — keep secrets in a secrets
manager entirely outside the project directory.

---

## 9. Updating the Preset

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

**Step 4 — Update the AGENTS.md managed section**

Extract the new managed section and replace the old one in your `AGENTS.md`. The
markers make this safe:

```bash
# Review what changed
diff <(awk '/CODECONDUCTOR:BEGIN managed/,/CODECONDUCTOR:END managed/' ./AGENTS.md) \
     <(awk '/CODECONDUCTOR:BEGIN managed/,/CODECONDUCTOR:END managed/' /tmp/codeconductor/AGENTS.md)
```

If the diff is acceptable, replace the managed section in your file.

**What is preserved across updates:**

- Your edits to `.opencode/agents/*.md` — these are local customizations
- Your edits to `opencode.jsonc` — the preset ships a default; yours is the
  authoritative copy
- `.opencode/PROJECT_CONTEXT.md` and any custom skill files you created
- The `## Project-Specific Notes` section in your `AGENTS.md`

**What is not preserved:**

- Edits made inside
  `<!-- CODECONDUCTOR:BEGIN managed --> ... <!-- CODECONDUCTOR:END managed -->`
  — treat this block as read-only

**Versioned contracts are immutable:**

If the update ships a new prompt version (e.g., `prompts/v0.2.0/`), do not
delete or overwrite `prompts/v0.1.0/`. Versioned prompts are append-only. Older
agent contracts that reference `v0.1.0` continue to work against the `v0.1.0`
prompts.
