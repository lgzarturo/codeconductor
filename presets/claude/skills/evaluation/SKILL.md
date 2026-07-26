---
name: evaluation
description:
  Agent scorecard criteria, outcome tracking, model profiles, and evaluation CLI.
  Use when running /cc:scorecard or measuring deliverable quality.
---

# Evaluation Skill

## Scorecard criteria (8 weighted)

See `docs/agent-scorecard.md`. Pass threshold: weighted score >= 2.0, no criterion at 0.

## CLI

```bash
npx cc-codeconductor scorecard create --task BC-001 --from-diff
npx cc-codeconductor scorecard record --task BC-001 --verdict PASS --score 2.5
npx cc-codeconductor scorecard list
npx cc-codeconductor scorecard aggregate
npx cc-codeconductor scorecard models
npx cc-codeconductor scorecard regression
npx cc-codeconductor scorecard matrix
npx cc-codeconductor scorecard compare-models
npx cc-codeconductor scorecard prompt-diff 0.4.0 0.5.0 --agent architect
```

## Outcome tracking

Append-only: `.codeconductor/evaluation/outcomes.jsonl`

Record after each phase (openspec) and after review gate with agent, model, verdict, optional cost/tokens.

## Execution profiles

`.codeconductor/evaluation/execution-profile.yml` — `balanced`, `quality`, `economical`.

Use `scorecard models` before OpenSpec execute loop to show phase → agent → model.

## Verdicts

PASS / REVISE / REJECT — see scorecard calculator rules in docs.
