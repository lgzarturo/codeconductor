---
description: >-
  [cc: alias] Evaluate deliverable quality — scorecard, outcome tracking, regression
  checklist, and aggregate stats.
---

# Scorecard Evaluation Workflow

Scope: $ARGUMENTS

---

## Step 0 — CCEP Bootstrap

Command: `scorecard` (fixed for this workflow — do not infer from user text)

1. Run: `npx cc-codeconductor ccep parse --command scorecard "$ARGUMENTS" --output json`
2. Run: `npx cc-codeconductor ccep resolve --command scorecard "$ARGUMENTS" --output json`
3. Run: `npx cc-codeconductor ccep profile scorecard --output json`
4. After planner/intake JSON is available, run: `npx cc-codeconductor ccep evaluate --command scorecard --input <planner.json> --output json`. If `stop` is true, show questions or risks and wait for human input.
5. Delegate to subagents using compiled CCEP prompts — never forward raw `$ARGUMENTS` to planners.

---

## Step 1 — Identify task

Use `$ARGUMENTS` as task id (e.g. `BC-001`) or read active item from `npx cc-codeconductor openspec status`.

---

## Step 2 — Create scorecard with auto-signals

```bash
npx cc-codeconductor scorecard create --task <id> --agent reviewer --from-diff
```

Review auto-suggested criteria (minimal diff, cc-gain). Complete remaining scores 0–3 per [`docs/agent-scorecard.md`](docs/agent-scorecard.md).

---

## Step 3 — Regression (optional)

```bash
npx cc-codeconductor scorecard regression
```

If required checks fail, **STOP** and report failures.

---

## Step 4 — Record outcome

```bash
npx cc-codeconductor scorecard record --task <id> --agent reviewer --model <model> --verdict PASS --score 2.5
```

Include `--cost` and `--tokens` when available from session metrics.

---

## Step 5 — Aggregate

```bash
npx cc-codeconductor scorecard aggregate
```

Report pass rate and average weighted score.

---

## Routing on verdict

- **PASS** — accept deliverable; update backlog if applicable
- **REVISE** — return to implementer/tester with findings
- **REJECT** — route to task-coach for re-scoping

Apply skill `evaluation`.
