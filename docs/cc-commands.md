# CodeConductor CLI Commands Reference

Reference for the CodeConductor CLI. Published package is **0.5.0**. Commands
under Product OS (`goal`, `ingest`, `product`, `orchestrate`, `impact`,
`verify`) are documented as **v1.0.0** — present in this repo via
`bun run dev`, not in the published npm package.

**Loops:** CCEP slash commands are the canonical consumer workflow (prefer
`/cc-iterative`, `/cc-triage`, `/cc-handoff`). OpenSpec is a delivery loop
and the backlog tool. `runWorkflowPipeline` is experimental library-only.

---

## Global Flags

These flags can be used with any command:

| Flag             | Shortcut | Description                                                                               |
| ---------------- | -------- | ----------------------------------------------------------------------------------------- |
| `--help`         | `-h`     | Show the help message with usage information                                              |
| `--version`      | `-v`     | Show the package version                                                                  |
| `--dry-run`      | —        | Preview what would happen without writing any files                                       |
| `--force`        | —        | Allow overwriting existing files                                                          |
| `--global`       | —        | Install to home directory instead of project directory (`~/.opencode`, `~/.claude`, etc.) |
| `--output`, `-o` | —        | Output mode: `human` (default, readable text) or `json` (structured data)                 |

---

## Commands

### `npx cc-codeconductor init`

Initializes CodeConductor in a project by creating the configuration file and
copying bundled presets.

**Behavior:**

1. Detects the project stack (languages, frameworks, runtimes)
2. Creates `.codeconductor/config.yml` with project metadata
3. Copies bundled presets (`council.yml`, `policy.yml`) to
   `.codeconductor/presets/`

**Supported stacks detection:**

- Node.js / Bun (via `package.json`, `node_modules`, `bun.lock`)
- Spring (via `build.gradle`, `pom.xml`)
- Django (via `manage.py`, `requirements.txt`)
- Astro (via `astro.config.mjs`)

**Options:**

- `--global` — Create global config in home directory instead of project
  directory
- `--dry-run` — Show what would be created without writing files
- `--force` — Overwrite existing configuration
- `--output, -o` — Output format (human/json)

**Exit codes:**

- `0` — Success
- `1` — Error (file write failure)
- `3` — No project signals detected (empty or unsupported project)

**Examples:**

```bash
# Initialize in current project
npx cc-codeconductor init

# Initialize globally (user home directory)
npx cc-codeconductor init --global

# Preview initialization without writing files
npx cc-codeconductor init --dry-run

# Overwrite existing configuration
npx cc-codeconductor init --force

# JSON output for scripting
npx cc-codeconductor init --output json
```

---

### `npx cc-codeconductor init --global`

Global initialization variant. Creates configuration in the user's home
directory (`~/.codeconductor/config.yml` on Unix,
`%USERPROFILE%\.codeconductor\` on Windows) instead of the current project.

Useful for setting up CodeConductor without modifying a specific project, or for
personal defaults that apply across all projects.

---

### `npx cc-codeconductor detect`

Analyzes the current project to identify its technology stack and recommends
suitable presets.

**What it detects:**

- **Languages:** javascript, typescript, java, kotlin, python
- **Runtimes:** node, bun, jvm, python
- **Package managers:** npm, bun
- **Frameworks:** spring, django, astro

**Output includes:**

- Detected signals (`package.json`, `build.gradle`, etc.)
- Detection confidence level (`low`, `medium`, `high`)
- Recommended presets based on detected stack

**Recommended presets by stack:**

| Detected Stack | Recommended Presets                |
| -------------- | ---------------------------------- |
| Any project    | `council`                          |
| Node.js / Bun  | `council`, `node-best-practices`   |
| Spring         | `council`, `spring-best-practices` |
| Django         | `council`, `django-best-practices` |

**Options:**

- `--output, -o` — Output format (human/json)

**Exit codes:**

- `0` — Success (signals detected)
- `3` — No signals detected (empty or unsupported project)
- `1` — Error

**Example:**

```bash
npx cc-codeconductor detect
# Output:
# Detected: node, typescript
# Frameworks: none
# Confidence: high
# Recommended: council, node-best-practices
```

---

### `npx cc-codeconductor install preset --target <target>`

Installs a complete preset package including agents, prompts, skills, and
commands for the specified runner.

**Targets:**

| Target     | Installs to     | Description                       |
| ---------- | --------------- | --------------------------------- |
| `opencode` | `.opencode/`    | OpenCode agent configuration      |
| `claude`   | `.claude/`      | Claude (Anthropic) agent config   |
| `codex`    | `.codex/`       | Codex (OpenAI) agent config       |
| `cursor`   | `.cursor/`      | Cursor IDE agent configuration    |
| `gemini`   | `.gemini/`      | Gemini agent configuration        |
| `agy`      | `.agents/`      | Antigravity CLI configuration     |
| `all`      | All above       | Install for all supported runners |

**Options:**

- `--target <target>` — Target runner(s): `opencode`, `claude`, `codex`, or
  `all`
- `--global` — Install to home directory instead of project
- `--dry-run` — Preview installation without writing files
- `--force` — Overwrite existing files
- `--output, -o` — Output format

**Exit codes:**

- `0` — Success
- `1` — Error (preset load failure)
- `2` — Partial failure (some files couldn't be written)

**Examples:**

```bash
# Install preset for OpenCode
npx cc-codeconductor install preset --target opencode

# Install preset for Cursor
npx cc-codeconductor install preset --target cursor

# Install preset for all runners
npx cc-codeconductor install preset --target all

# Install preset for Antigravity CLI
npx cc-codeconductor install preset --target agy

# Install globally for Claude
npx cc-codeconductor install preset --target claude --global

# Preview what would be installed
npx cc-codeconductor install preset --target all --dry-run

# Force overwrite existing files
npx cc-codeconductor install preset --target opencode --force
```

---

### `npx cc-codeconductor install council --target <target>`

Installs only the council specification files (agent definitions, policies)
without full preset contents. This is a lighter-weight installation focused on
the council structure.

**Targets:**

| Target     | Installs to     | Content                         |
| ---------- | --------------- | ------------------------------- |
| `opencode` | `.opencode/`    | OpenCode-formatted council spec |
| `claude`   | `.claude/`      | Claude-formatted council spec   |
| `codex`    | `.codex/`       | Codex-formatted council spec    |
| `agy`      | `.agents/`      | Antigravity-formatted council spec |
| `all`      | All four above  | All four formats                |

**Options:**

- `--target <target>` — Target runner(s)
- `--global` — Install to home directory
- `--dry-run` — Preview without writing files
- `--force` — Overwrite existing files
- `--output, -o` — Output format

**Examples:**

```bash
# Install council spec for OpenCode
npx cc-codeconductor install council --target opencode

# Install council for all runners
npx cc-codeconductor install council --target all

# Global installation for Claude
npx cc-codeconductor install council --target claude --global

# Preview council installation
npx cc-codeconductor install council --target all --dry-run
```

---

### `npx cc-codeconductor doctor`

Validates the CodeConductor configuration and installed files, checking for
common issues.

**Checks performed:**

1. **Config exists** — `.codeconductor/config.yml` must be present
2. **Config valid** — Configuration passes schema validation
3. **Runner directories** — Check for `.opencode/`, `.claude/`, `.codex/`
   directories
4. **Council enabled** — Verifies council preset is enabled
5. **Security compatibility** — Checks if target can enforce the policy model

**Options:**

- `--output, -o` — Output format

**Exit codes:**

- `0` — All checks passed
- `1` — Config validation failed
- `4` — Config not found or critical checks failed

**Example:**

```bash
npx cc-codeconductor doctor
# Output:
# ✓ config-exists: .codeconductor/config.yml exists
# ✓ config-valid: Config is valid
# ✓ dir-.opencode: .opencode/ exists
# ✓ dir-.claude: .claude/ not found (optional)
# ✓ dir-.codex: .codex/ not found (optional)
# ✓ council-enabled: Council preset enabled (v1.0.0)
# ✓ security-opencode: opencode can represent the canonical policy model
```

---

### `npx cc-codeconductor update`

Updates installed presets to the latest version from `.codeconductor/presets/`.

**Behavior:**

1. Loads current configuration
2. Compares installed version with preset version
3. If updates available, regenerates files for the default target
4. Reports changed files

**Options:**

- `--dry-run` — Show what would be updated without making changes
- `--force` — Overwrite existing files during update
- `--output, -o` — Output format

**Exit codes:**

- `0` — Success (update applied or already up to date)
- `1` — Error (no config, load failure)
- `2` — Partial failure (some files couldn't be written)
- `4` — Council preset not enabled

**Example:**

```bash
# Check for updates
npx cc-codeconductor update --dry-run
# Output: Already up to date (v1.0.0)

# Apply available updates
npx cc-codeconductor update
# Output: Updated successfully (v1.0.0 → v1.1.0)

# Force overwrite during update
npx cc-codeconductor update --force
```

---

### `npx cc-codeconductor help`

Shows general CLI usage and the command list (same text as `--help`).

This is **not** an alias of `cc-help`.

**Exit codes:**

- `0` — Success

**Examples:**

```bash
npx cc-codeconductor help
npx cc-codeconductor --help
```

---

### `npx cc-codeconductor cc-help`

Shows the preset inventory for the active or specified target — listing skills,
subagents, commands, and workflows available in `presets/<target>/`.

**Options:**

- `--target <target>` — Show inventory for a specific target instead of the
  active default
- `--output, -o` — Output format (`human` / `json`)

**Exit codes:**

- `0` — Success
- `1` — Error

**Examples:**

```bash
# Show inventory for the active target
npx cc-codeconductor cc-help

# Show inventory for a specific target
npx cc-codeconductor cc-help --target claude

# JSON output for scripting
npx cc-codeconductor cc-help --output json
```

**JSON output shape:**

```json
{
  "success": true,
  "command": "cc-help",
  "inventory": {
    "target": "opencode",
    "skills": ["graphify", "skill-creator"],
    "commands": ["cc-pagespeed"],
    "agents": ["architect", "implementer"],
    "workflows": []
  },
  "defaultTarget": "opencode"
}
```

---

### `npx cc-codeconductor debt-harvest`

Scans source files for `// defer - [reason]` comments and consolidates them
into `.codeconductor/debt-ledger.md`. The ledger is grouped by optional tag
(`// defer - reason --tag`).

**Aliases:** `harvest`

**Behavior:**

1. Walks the target directory (default: `src/`) recursively
2. Skips hidden directories and `node_modules`
3. Matches source files by extension (`.ts`, `.tsx`, `.js`, `.jsx`, `.go`,
   `.rs`, `.java`, `.kt`, `.swift`, `.cs`, `.php`, `.scala`, `.dart`, `.c`,
   `.cpp`, `.h`, `.hpp`)
4. Extracts `// defer - [reason]` and optional `--tag` from each line
5. Writes `.codeconductor/debt-ledger.md` (creates `.codeconductor/` if needed)

**Options:**

- `--dir <path>` — Directory to scan (default: `src`)
- `--output, -o` — Output format (`human` / `json`)

**Exit codes:**

- `0` — Success
- `1` — Error

**Examples:**

```bash
# Scan default src/ directory
npx cc-codeconductor debt-harvest

# Scan a different directory
npx cc-codeconductor debt-harvest --dir lib

# JSON output
npx cc-codeconductor debt-harvest --output json

# Using the alias
npx cc-codeconductor harvest
```

**Defer comment syntax:**

```typescript
// defer - Extract validation logic to shared module --refactor
// defer - This query is N+1 and needs batching --performance
// defer - Replace with proper error type
```

**Ledger output** (`.codeconductor/debt-ledger.md`):

```markdown
<!-- CODECONDUCTOR:BEGIN managed -->

# Debt Ledger

> Auto-generated by `codeconductor debt-harvest`. Do not edit manually.

## performance

| File | Line | Reason |
| ---- | ---- | ------ |
| src/users/repository.ts | 42 | This query is N+1 and needs batching |

## refactor

| File | Line | Reason |
| ---- | ---- | ------ |
| src/auth/middleware.ts | 18 | Extract validation logic to shared module |

## unclassified

| File | Line | Reason |
| ---- | ---- | ------ |
| src/utils/parser.ts | 7 | Replace with proper error type |
<!-- CODECONDUCTOR:END managed -->

```

---

### `npx cc-codeconductor goal`

Decomposes an objective string into a dependency-ordered task graph. Matches
the objective against built-in templates or falls back to a generic 4-task
chain. Writes the result to `.codeconductor/current-goal.yml`.

**Aliases:** `cc-goal`

**Behavior:**

1. Matches objective keywords against built-in templates (auth, crud, search,
   notification, migration)
2. Falls back to generic 4-task chain: `task-coach → architect → tester → implementer`
3. Validates the graph (unique IDs, valid `depends_on` references, no cycles)
4. Writes `.codeconductor/current-goal.yml`
5. Renders a dependency tree diagram (human output) or structured JSON

**Templates:**

| Keywords | Tasks |
| --- | --- |
| `login`, `auth`, `authentication`, `signin` | schema → API → implementation → tests |
| `crud`, `resource`, `api`, `endpoint`, `rest` | model → service → API → tests |
| `search`, `filter`, `query`, `full-text`, `fts` | schema → service → API → tests |
| `notification`, `email`, `alert`, `push`, `notify` | model → service → API → tests |
| `migration`, `migrate`, `schema change` | script → model → DAL → tests |
| *(no match)* | scope → design → implementation → tests |

**Options:**

- `--output, -o` — Output format (`human` / `json`)

**Exit codes:**

- `0` — Success
- `1` — Error (empty objective, write failure, validation error)

**Examples:**

```bash
# Plan an auth goal
npx cc-codeconductor goal "Add user authentication"

# Plan a CRUD goal
npx cc-codeconductor goal "Implement CRUD for invoices"

# Using the alias
npx cc-codeconductor cc-goal "Add search with filters"

# JSON output for scripting
npx cc-codeconductor goal "Add user authentication" --output json
```

**Human output:**

```text
Objective: Add user authentication

Task dependency graph:
├── auth-schema: Define auth data model and DB schema
│   └── auth-api: Define auth API contract
│       └── auth-impl: Implement auth endpoints
│           └── auth-tests: Write auth tests

Tasks: 4 total
File: .codeconductor/current-goal.yml
```

**JSON output shape:**

```json
{
  "success": true,
  "command": "goal",
  "objective": "Add user authentication",
  "tasks": [
    {
      "id": "auth-schema",
      "title": "Define auth data model and DB schema",
      "type": "feature",
      "risk": "high",
      "depends_on": [],
      "status": "pending"
    }
  ],
  "file": ".codeconductor/current-goal.yml"
}
```

**Orchestrator integration:**

The orchestrator reads `.codeconductor/current-goal.yml` and delegates tasks in
dependency order. A task is only routed after all its `depends_on` targets
complete with status `done`. If a dependency is `blocked`, the dependent task
remains `pending`.

---

### `npx cc-codeconductor openspec <subcommand>`

OpenSpec is a **delivery loop** (validate-backlog → discover → design → test →
implement → review) and the **backlog** tool for `BACKLOG.md`.

OpenSpec backlog delivery: validate `BACKLOG.md`, scan changes, plan TaskCards,
and return the next executable card.

**Subcommands:**

| Subcommand | Description |
| ---------- | ----------- |
| `validate` | Validate BACKLOG.md format and business rules (mandatory gate) |
| `scan` | Git diff + item-level change detection vs last snapshot |
| `plan [BC-id]` | Generate TaskCards and `openspec/changes/<slug>/` for an item |
| `status` | Active item, next READY item, task card counts |
| `next` | JSON for the next pending TaskCard (respects dependencies) |

**Examples:**

```bash
npx cc-codeconductor openspec validate
npx cc-codeconductor openspec scan
npx cc-codeconductor openspec plan BC-001
npx cc-codeconductor openspec status --output json
npx cc-codeconductor openspec next --output json
```

**State files:**

- `BACKLOG.md` — human-readable queue (root)
- `.codeconductor/openspec-state.json` — task cards, snapshots, change paths

---

### `npx cc-codeconductor scorecard <subcommand>`

Agent quality evaluation: scorecards, outcome tracking, regression checks, model matrix.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `create` | Create scorecard with optional `--from-diff` auto-signals |
| `show <id>` | Display saved scorecard |
| `record` | Append outcome to `outcomes.jsonl` |
| `list` | List outcomes (`--agent`, `--model`, `--since`) |
| `aggregate` | Pass rate and average scores |
| `models` | Phase → agent → model table for OpenSpec |
| `prompt-diff <from> <to>` | Diff prompt contracts between versions |
| `regression` | Run regression checklist |
| `matrix` | Generate cost/quality matrix |
| `compare-models` | Model comparison report from outcomes |

**Examples:**

```bash
npx cc-codeconductor scorecard create --task BC-001 --from-diff
npx cc-codeconductor scorecard record --task BC-001 --verdict PASS --score 2.5 --cost 0.12 --tokens 45000
npx cc-codeconductor scorecard models
npx cc-codeconductor scorecard prompt-diff 0.4.0 0.5.0 --agent architect
npx cc-codeconductor scorecard regression
npx cc-codeconductor scorecard matrix --output json
```

**State files:**

- `.codeconductor/evaluation/outcomes.jsonl`
- `.codeconductor/evaluation/scorecards/*.json`
- `.codeconductor/evaluation/execution-profile.yml`

---

## Agent Commands (Claude / OpenCode / Cursor)

Agent commands are slash commands available inside Claude Code, OpenCode, and
Cursor. They are installed as part of the preset (see `install preset`). Unlike
CLI commands, they do not require `npx cc-codeconductor` — they are invoked
directly in the conversation.

### Cursor slash commands

After `install preset --target cursor`, commands live in `.cursor/commands/cc/`.
Dogfooding this repository also keeps maintainer-only `/cc-self-review` stubs.

Primary CCEP loop (use these first):

| Command | Description |
| ------- | ----------- |
| `/cc-iterative` / `/cc:iterative` | Wayfinding, grilling, contracts, TDD, council, docs |
| `/cc-triage` / `/cc:triage` | Classify request → destination workflow |
| `/cc-handoff` / `/cc:handoff` | Compact session to gitignored `.codeconductor/sessions/handoff.md` |
| `/cc-backlog` / `/cc:backlog` | Author or append `BACKLOG.md` + plan OpenSpec folders |
| `/cc-openspec` | OpenSpec delivery loop |

Other installed commands:

| Command | Description |
| ------- | ----------- |
| `/cc-feature` | Full feature workflow |
| `/cc-fix` | Bug fix workflow |
| `/cc-refactor` | Refactor workflow |
| `/cc-review` | Structured code review |
| `/cc-test-plan` | Test planning |
| `/cc-tdd-cycle` | TDD cycle |
| `/cc-api-contract` | API contract definition |
| `/cc-db-migration` | Database migration workflow |
| `/cc-pagespeed` | PageSpeed audit |
| `/cc-security` / `/cc:security` | Authorized defensive security work |
| `/cc-scorecard` | Agent scorecard evaluation |
| `/cc-council` | Council-driven SDD/TDD/review |
| `/cc-explore` / `/cc:explore` | Repo map and next-command suggestion |
| `/cc-prototype` / `/cc:prototype` | Disposable spike (isolated worktree) |
| `/cc-clarify` / `/cc:clarify` | Re-explain last deliverable |

Use `/multitask` before parallel steps (e.g. review + docs) for concurrent
subagent execution.

---

### `/cc:security` / `/cc-security [request]`

Authorized **defensive** security work: pick a `security-*` domain skill,
require an authorization statement, then route like `/cc-fix` (tests before
implement; Reviewer on medium/high). High-risk work also uses
`security-reviewer`.

**Does not** produce exploit payloads, malware, or attack procedures.

**Available in**: Claude Code (`/cc:security`), Cursor (`/cc-security` /
`/cc:security`), OpenCode (`/cc-security`), AGY (`/cc-security`).

**Task Card must include:** objective, domain, authorization, risk, scope.

```text
/cc-security authorized vuln assessment of staging checkout API (ticket SEC-214)
```

---

### `/cc-pagespeed --url <url>`

Audits web performance using the PageSpeed Insights API (PSI v5). Applies the
80/20 principle to produce a prioritized markdown report of Core Web Vitals with
framework-specific code fixes.

**Available in**: Claude Code (`/cc-pagespeed`), OpenCode (`cc-pagespeed`),
Codex (trigger: `"Run a PageSpeed audit for: [url]"`).

**Parameters:**

| Parameter    | Required | Description                                         |
| ------------ | -------- | --------------------------------------------------- |
| `--url`      | Yes      | Full URL to audit (must include `https://`)         |
| `--strategy` | No       | `mobile`, `desktop`, or `both` (default: `both`)   |

**Requires: `PAGESPEED_API_KEY`** — optional but strongly recommended.

| Mode         | Lab data | CrUX field data  | Daily quota      |
| ------------ | -------- | ---------------- | ---------------- |
| With key     | ✅        | ✅ (real users)  | 25,000 req/day   |
| Without key  | ✅        | ❌               | Shared limit     |

Set the key in your environment:

```powershell
# Windows PowerShell
$env:PAGESPEED_API_KEY = "your-api-key"

# macOS / Linux
export PAGESPEED_API_KEY="your-api-key"
```

Get a free key: <https://developers.google.com/speed/docs/insights/v5/get-started>

**Output:** Report saved as `{YYYY-MM-DD}_pagespeed-{hostname}-claude.md` in
the current working directory.

**Metrics analyzed:**

- Core Web Vitals: LCP, INP, CLS, FCP, TBT, TTFB
- LCP element identification
- Third-party scripts by blocking time
- Render-blocking resources
- Unused JavaScript and CSS (bytes saved)
- Resource hints: `preload`, `preconnect`, `prefetch`
- Image optimization: WebP, lazy loading, `fetchpriority`
- Font loading: `font-display`, preloaded subsets

**Examples:**

```bash
# Full audit — mobile + desktop
/cc-pagespeed --url https://www.example.com

# Mobile only
/cc-pagespeed --url https://www.example.com --strategy mobile
```

See `docs/pagespeed-usage.md` for the complete usage guide.

---

### `/cc:backlog` / `/cc-backlog [objectives]`

Authors `BACKLOG.md`: wayfinding, grilling, create or append items, `openspec
validate`, then `openspec plan` for new IDs so `/cc-openspec` can deliver.
Does not implement.

**Available in**: Claude Code (`/cc:backlog`), OpenCode (`/cc-backlog`), AGY
(`/cc-backlog`), Cursor (`/cc-backlog` / `/cc:backlog`).

In consumer projects, `init` gitignores `BACKLOG.md`, `openspec/`, and
`.codeconductor/openspec-state.json`. Do not commit those files.

**Examples:**

```bash
/cc:backlog add auth session refresh with measurable acceptance
/cc-backlog split the checkout rewrite into tracer-bullet items
```

---

### `/cc:openspec` / `/cc-openspec [BC-id]`

Runs the OpenSpec backlog delivery workflow: validate `BACKLOG.md`, scan, plan
TaskCards, orchestrate agents by phase (discover → design → test → implement →
review), reviewer gate, and backlog updates.

**Available in**: Claude Code (`/cc:openspec`), OpenCode (`/cc-openspec`), AGY
(`/cc-openspec`).

**CLI gate (mandatory):** `npx cc-codeconductor openspec validate` must pass before
processing.

**Examples:**

```bash
/cc:openspec
/cc:openspec BC-001
```

---

### `/cc:scorecard` / `/cc-scorecard [task-id]`

Runs scorecard evaluation: create with auto-signals, regression checklist, record outcome, aggregate stats.

**Available in**: Claude Code (`/cc:scorecard`), OpenCode (`/cc-scorecard`), AGY (`/cc-scorecard`).

```bash
/cc:scorecard BC-001
```

---

## Target Resolution

The `--target` option accepts these values:

```typescript
type RunnerTarget = 'opencode' | 'claude' | 'codex' | 'all'
```

When `--target all` is specified, the command applies to all three runners
sequentially.

When `--global` is combined with `--target`, installation goes to:

- Unix: `~/.opencode/`, `~/.claude/`, `~/.codex/`
- Windows: `%USERPROFILE%\.opencode\`, etc.

## Exit Code Reference

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| `0`  | Success                                        |
| `1`  | Error (generic)                                |
| `2`  | Partial success (some files failed)            |
| `3`  | No project signals / Unsupported project       |
| `4`  | Configuration missing or critical check failed |

## Output Modes

### Human (`--output human`)

Default output format. Readable text with progress messages, lists, and
formatted tables.

```
✓ Council preset installed to .opencode/
✓ Council preset installed to .claude/
```

### JSON (`--output json`)

Structured output suitable for scripting and integration.

```json
{
  "success": true,
  "command": "install",
  "targets": ["opencode", "claude"],
  "written": [
    ".opencode/agents/council-architect.md",
    ".opencode/agents/council-security.md",
    ".claude/agents/council-architect.md"
  ]
}
```
