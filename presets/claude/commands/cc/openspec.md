---
description: >-
  [cc: alias] Run OpenSpec backlog delivery — validate BACKLOG.md, plan TaskCards,
  orchestrate agents by phase, review gate, and update backlog state.
---

# OpenSpec Backlog Workflow

Scope: $ARGUMENTS

Orchestrate FIFO delivery from `BACKLOG.md`. CodeConductor owns planning; agents execute one TaskCard per phase with the installed preset model for each role.

---

## Step 0 — Validate (mandatory gate)

Run:

```bash
npx cc-codeconductor openspec validate
```

If validation fails:

1. List all errors and recommendations from the CLI output.
2. Show the canonical BACKLOG.md structure (## Global, ## Items, ### BC-001 | Title, Priority, Status, Type, Depends on, Description, Scope, Acceptance).
3. **STOP.** Do not scan, plan, or execute until the user fixes BACKLOG.md.

---

## Step 0 — CCEP Bootstrap

Command: `openspec` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command openspec "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command openspec "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile openspec --output json`
4. If the ConfirmationGate stops the flow, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.

---

## Step 1 — Scan

Run:

```bash
npx cc-codeconductor openspec scan
```

Report: new items, modified items, closed/archived items, and whether the file changed.

---

## Step 2 — Select item

If `$ARGUMENTS` contains a `BC-xxx` ID, use that item. Otherwise run:

```bash
npx cc-codeconductor openspec status
```

Pick the next `READY` item with satisfied dependencies (FIFO by priority). Skip items in `DONE` or `Archive`.

**STOP if no eligible item.** Report backlog status and wait for the user.

---

## Step 3 — Plan

Run:

```bash
npx cc-codeconductor openspec plan <BC-id>
```

Show:

- Generated TaskCards (discover → design → test → implement → review when TDD required)
- Path to `openspec/changes/<slug>/` (proposal, design, tasks, specs)

Update BACKLOG item status to `PLANNED` (CLI does this automatically).

---

## Step 4 — Model matrix and execute loop

Before executing phases, show resolved models:

```bash
npx cc-codeconductor scorecard models
```

For each pending TaskCard, run:

```bash
npx cc-codeconductor openspec next
```

Invoke the agent named on the card with **isolated** context (`/clear` between phases unless continuation is required):

| Phase | Agent | Role |
|-------|-------|------|
| discover | repo-explorer | Map repo and impact |
| design | architect | Technical plan |
| test | tester | TDD tests (before implement if TDD required) |
| implement | implementer | Minimal diff in worktree |
| review | reviewer | Acceptance + scope gate |

Use the model configured in the installed preset for each agent role.

After each phase:

- Mark progress in deliverable summary.
- Set TaskCard status to `done` in `.codeconductor/openspec-state.json` when phase completes.

Implementer: create a Git worktree before editing (`git worktree add ../<branch>-session <branch>`).

---

## Step 5 — Review gate

Run regression when BACKLOG Global `Review required: yes`:

```bash
npx cc-codeconductor scorecard regression
```

The `reviewer` agent must verify:

- All acceptance criteria from BACKLOG.md
- Tests pass
- Scope matches the backlog item
- No architectural violations

If **rejected**: set item status `IN_PROGRESS`, record findings in state, **STOP** and report to user.

If **approved**: proceed to Step 6.

---

## Step 6 — Scorecard and update backlog

1. `npx cc-codeconductor scorecard create --task <BC-id> --from-diff`
2. Complete criteria; `scorecard record` with verdict and optional cost/tokens
3. Set item `Progress: 100%`, `Status: DONE` if PASS
4. Move item to `## Archive` in BACKLOG.md if DONE
5. Run `npx cc-codeconductor openspec scan`

Report completion: Task Cards executed, scorecard verdict, change folder path, files changed.

---

## Skill

Apply `.claude/skills/openspec/SKILL.md` for backlog format rules and state transitions.
