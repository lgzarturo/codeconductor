# Local Usage Guide — CodeConductor CLI

This guide explains how to **validate CodeConductor commands locally** without
publishing the npm package. It complements [`usage-cli.md`](usage-cli.md)
(installation and `npx`) and [`cc-commands.md`](cc-commands.md) (full reference).

## Execution convention

From the repository root:

```bash
# Recommended (dev script in package.json)
bun run dev <command> [options]

# Direct equivalent
bun run src/cli/main.ts <command> [options]

# Useful alias for test sessions
export CC='bun run dev'
$CC goal "Add user authentication"
```

| Production (`npx`) | Local development (`bun run dev`) |
| ------------------ | ------------------------------- |
| `npx cc-codeconductor seo audit --url …` | `bun run dev seo audit --url …` |
| `npx cc-codeconductor goal "…"` | `bun run dev goal "…"` |
| `npx cc-codeconductor ccep parse …` | `bun run dev ccep parse …` |

---

## Prerequisites

| Group | Requirement |
| ----- | ----------- |
| General | Bun installed, `bun install`, cwd = repo root |
| Tests | `bun test` (full suite) or `bun run test:fast` (skips timeout/git-heavy files) |
| `init` / scorecard | `bun run dev init` (idempotent; creates `.codeconductor/evaluation/`) |
| `openspec` | `BACKLOG.md` in cwd — copy the fixture: `cp test/fixtures/backlog/BACKLOG.md .` |
| `scorecard create --from-diff` | Git repo with staged or unstaged changes |
| `seo` | Network access (public URLs) |

### Quick setup (once per session)

```bash
bun install
bun run dev init
cp test/fixtures/backlog/BACKLOG.md .
```

---

## SEO

These commands require network access. `example.com` is sufficient for basic smoke
tests.

### Audit a URL

```bash
bun run dev seo audit --url https://example.com
```

**What it does:** runs SEO checks (meta, canonical, headings, etc.) on a single page.

**Expected output:**
- Exit code: `0` (even when the page has SEO issues; the CLI reports findings)
- Default CLI format: summary with score, passed/warnings/errors
- With `--format json`: JSON object with `target`, `timestamp`, `pages[]`, `checks[]`

```bash
bun run dev seo audit --url https://example.com --format json
```

### Audit a sitemap

```bash
bun run dev seo audit --sitemap https://example.com/sitemap.xml
```

**Expected output:** CLI report with audited pages. Note: the `example.com` sitemap
may return **0 pages**; the command is still valid as a connectivity and parsing
smoke test.

### Audit sitemap as Markdown

```bash
bun run dev seo audit --sitemap https://example.com/sitemap.xml --format markdown
```

**Expected output:**
- Exit code: `0`
- File saved to `seo-reports/audit-report-<timestamp>.md`
- Message: `Report saved to: …/seo-reports/audit-report-….md`

### Generate llms.txt from sitemap

```bash
bun run dev seo llms --sitemap https://example.com/sitemap.xml
```

**Expected output:**
- Exit code: `0`
- `llms.txt` in cwd (may have 0 entries if the sitemap is empty)
- Message: `Generated: …/llms.txt (N entries)`

### Generate llms.txt from URL with explicit output

```bash
bun run dev seo llms --url https://example.com --output llms.txt
```

**Expected output:**
- Exit code: `0`
- `llms.txt` with extracted title, description, and links
- Example content: `# Example Domain` with a `## Main Pages` section

**Common failures:**
- No network → timeout or fetch error
- Missing both `--url` and `--sitemap` → exit `1`, error: `Either --url or --sitemap is required`

---

## Goal / cc-goal

Deterministic objective planning into a YAML task dependency graph.

### goal

```bash
bun run dev goal "Add user authentication"
```

**Expected output:**
- Exit code: `0`
- Dependency tree printed to console (e.g. `auth-schema` → `auth-api` → `auth-impl` → `auth-tests`)
- File: `.codeconductor/current-goal.yml`

### cc-goal (alias)

```bash
bun run dev cc-goal "Implement CRUD for invoices"
```

**Expected output:** same format as `goal`; overwrites `.codeconductor/current-goal.yml`
with tasks `crud-model` → `crud-service` → `crud-api` → `crud-tests`.

**Verification:**

```bash
cat .codeconductor/current-goal.yml
# Should contain objective, tasks[], depends_on[], created_at
```

---

## CCEP (CodeConductor Execution Protocol)

See the full specification in [`ccep-1.md`](ccep-1.md).

### parse — structured envelope

```bash
bun run dev ccep parse --command fix "login fails"
bun run dev ccep parse --command fix "login fails" --output json
```

**Expected output (JSON):**
- `success: true`
- `envelope.protocolVersion: "ccep-1"`
- `envelope.command: "fix"`
- `envelope.userRequest: "login fails"`

### profile — workflow profile

```bash
bun run dev ccep profile council --output json
```

**Expected output:**
- `profile.id: "council"`
- `profile.phases[]` with agents (`task-coach`, `architect`, etc.)

### resolve — full execution context

```bash
bun run dev ccep resolve --command feature "Add CRUD" --output json
```

**Expected output:**
- `context.envelope`, `context.profile`, `context.intent`, `context.project`
- `constraints.needConfirmation: true` for feature

### compile — 7-layer prompt

```bash
bun run dev ccep compile --command feature "Add CRUD" --phase intake --output json
```

**Expected output:**
- `success: true`
- `phase: "intake"`, `role: "task-coach"`, `outputSchema: "planner-output"`
- `promptVersion: "v1.0.0"`
- `layers[]` (system, agent, policies, knowledge, ast, task, output_schema)
- `prompt` — compiled text ready for the agent

**Valid phases (feature):** `intake`, `design`, `implement`, `test`, `review`, `docs`.
Using `--phase plan` fails with `Unknown phase: plan`.

### validate — agent output validation

```bash
bun run dev ccep validate --command feature --phase implement --role implementer \
  '{"status":"success","confidence":0.9,"warnings":[],"artifacts":[],"next_actions":[],"filesChanged":[{"path":"src/a.ts","summary":"change"}],"tests":{"runner":"bun test","result":"passed"}}' \
  --output json
```

**Expected output (valid payload):**
- `valid: true`, exit code `0`
- `schema: "implementer-output"`

**Invalid payload:** exit code `1`, `valid: false`, `errors` array with Zod details.

**Notes:**
- Use inline JSON at the end of the command, or `--input @path/to/file.json`
- There is no `--payload` flag; use `--input` or positional JSON

---

## OpenSpec

Requires `BACKLOG.md` in cwd (see setup).

### validate

```bash
bun run dev openspec validate
bun run dev openspec validate --output json
```

**Expected output (JSON):**
```json
{
  "success": true,
  "valid": true,
  "itemCount": 1,
  "errors": [],
  "recommendations": []
}
```

### scan

```bash
bun run dev openspec scan --output json
```

**Expected output:** `modifiedItems`, `newItems`, `closedItems`, `contentHash`.

### plan

```bash
bun run dev openspec plan BC-001
```

**Expected output:**
- Exit code: `0`
- Creates artifacts under `openspec/changes/bc-001-first-backlog-item/` (proposal, tasks, specs)

### status

```bash
bun run dev openspec status --output json
```

**Expected output:**
- `activeItemId: "BC-001"`
- `taskCardsPending`, `changePaths`

### next

```bash
bun run dev openspec next --output json
```

**Expected output:**
- `taskCard` with `id`, `phase`, `agent`, `prompt`, `dependsOn`, `status: "pending"`

**Common failures:**
- Missing `BACKLOG.md` → validation error
- Non-existent `BC-999` → planning error

---

## Scorecard

Requires `bun run dev init` for `.codeconductor/evaluation/`.

### create

```bash
bun run dev scorecard create --task BC-001 --from-diff
bun run dev scorecard create --task BC-001 --from-diff --output json
```

**Expected output (JSON):**
- `scorecard.id` (e.g. `sc-ms25f2zi-xdhp`)
- `scorecard.taskId: "BC-001"`
- `criteria[]` with scores and `autoSuggested` when diff applies
- File persisted at `.codeconductor/evaluation/scorecards/<id>.json`

### models

```bash
bun run dev scorecard models --output json
```

**Expected output:** `profile`, `phases[]` with `agent`, `model`, `modelKey`.

### aggregate

```bash
bun run dev scorecard aggregate --output json
```

**Expected output:**
- `total`, `passRate`, `avgWeightedScore`, `byAgent`, `byModel`, `byVariant`
- Values at `0` when no outcomes have been recorded yet

### catalog / experiment / ablation

```bash
bun run dev scorecard catalog --output json
bun run dev scorecard fingerprint --output json
bun run dev scorecard experiment start --suite harness-v1 --components review,wayfinding
bun run dev scorecard experiment apply --id <exp> --variant minus:review
bun run dev scorecard record --task fix-add-off-by-one --verdict PASS --score 2.4 --experiment <exp> --variant minus:review --suite-task fix-add-off-by-one
bun run dev scorecard ablation --experiment <exp> --output json
```

The runner writes isolated run directories under
`.codeconductor/evaluation/experiments/<id>/runs/`. Execute each `TASK.md`
with the host agent, then record outcomes with `--experiment` and `--variant`.
See [ADR-012](adr/adr-012-harness-ablation.md).

---

## Help

### OpenCode

```bash
bun run dev help --target opencode
```

**Expected output:** CLI command list (init, detect, install, seo, goal, ccep, openspec, scorecard, etc.).

### Claude (JSON)

```bash
bun run dev help --target claude --output json
```

**Note:** the CLI prints the help header to stdout; use `--output json` for
integrations that consume structured subcommand output.

---

## End-to-end validation checklist

Recommended order (~5–10 min):

```bash
# 1. Test suite
bun test
# Local loop (skips compile-timeout, nested bun test, and git-gate files):
# bun run test:fast

# 2. Setup
bun run dev init
cp test/fixtures/backlog/BACKLOG.md .

# 3. Offline
bun run dev goal "Add user authentication"
bun run dev cc-goal "Implement CRUD for invoices"
bun run dev ccep parse --command fix "login fails" --output json
bun run dev ccep profile council --output json
bun run dev ccep resolve --command feature "Add CRUD" --output json
bun run dev ccep compile --command feature "Add CRUD" --phase intake --output json
bun run dev openspec validate --output json
bun run dev openspec scan --output json
bun run dev openspec plan BC-001
bun run dev openspec status --output json
bun run dev openspec next --output json
bun run dev scorecard create --task BC-001 --from-diff --output json
bun run dev scorecard models --output json
bun run dev scorecard aggregate --output json
bun run dev help --target opencode
bun run dev help --target claude --output json

# 4. Network (optional)
bun run dev seo audit --url https://example.com
bun run dev seo audit --sitemap https://example.com/sitemap.xml
bun run dev seo audit --sitemap https://example.com/sitemap.xml --format markdown
bun run dev seo llms --sitemap https://example.com/sitemap.xml
bun run dev seo llms --url https://example.com --output llms.txt
```

**Success criteria:** all offline commands exit with code `0`; SEO commands succeed
when network is available.

---

## Generated artifacts and cleanup

Smoke tests leave **untracked** files. Do not commit them.

| Artifact | Source | Cleanup |
| -------- | ------ | ------- |
| `.codeconductor/current-goal.yml` | `goal` / `cc-goal` | `rm .codeconductor/current-goal.yml` |
| `.codeconductor/evaluation/scorecards/*.json` | `scorecard create` | delete test files |
| `.codeconductor/openspec-state.json` | `openspec plan` | regenerable via `init` |
| `openspec/changes/` | `openspec plan` | `rm -rf openspec/changes/` |
| `BACKLOG.md` (copied from fixture) | manual setup | `rm BACKLOG.md` if not project-owned |
| `llms.txt` | `seo llms` | `rm llms.txt` |
| `seo-reports/` | `seo audit --format markdown` | `rm -rf seo-reports/` |

```bash
# Optional post-smoke-test cleanup
rm -f llms.txt BACKLOG.md .codeconductor/current-goal.yml
rm -rf seo-reports/ openspec/changes/
```

---

## References

- [CCEP-1 — Execution protocol](ccep-1.md)
- [Usage CLI (npx / packaging)](usage-cli.md)
- [Command reference](cc-commands.md)
- Backlog fixture: [`test/fixtures/backlog/BACKLOG.md`](../test/fixtures/backlog/BACKLOG.md)
