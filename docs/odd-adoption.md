# ODD adoption evaluation

ODD remains opt-in until `odd-adoption` has evaluated at least two paired
deliveries for each route. A pair has the same sample ID and compares tracked
ODD with OpenSpec.

Run the repeatable, no-LLM gate locally:

```bash
bun run dev scorecard suite-run --suite odd-adoption
```

The suite publishes these criteria:

| Measure | ODD may become eligible only when |
| --- | --- |
| Acceptance | its pass rate is not below OpenSpec |
| Tests | its pass rate is not below OpenSpec |
| Findings | its average finding count is not above OpenSpec |
| Context | its average measured context bytes are lower |
| Cost | if all samples report cost, its average cost is not above OpenSpec; otherwise report `unknown`, never savings |

An `eligible` result is evidence for recommending ODD by default, not an
automatic configuration change. Any missing pair, quality regression, absent
context reduction, or measured cost increase leaves ODD `opt-in`.

## Choosing a workflow

| Situation | Use | Return to the formal flow when |
| --- | --- | --- |
| A bounded, authorized change with known checks | ODD (`/cc-odd`) | scope expands, evidence must survive a handoff, or the user requests tracked planning |
| Multi-step work needing Task Cards, acceptance tracking, or formal review | OpenSpec (`/cc-openspec`) | never bypass its review/TDD gates; use it directly for an active backlog item |
| Any implementation change | TDD (`/cc-tdd-cycle`) before implementation | a failing behavior test defines the next smallest change |
| A material decision, cross-domain risk, or explicit request | Council (`/cc-council`) | the receipt, quorum, and veto policy require escalation |

For an interrupted tracked ODD delivery, read and reconcile its Delivery Ledger
against the working tree before taking the next action. Do not recreate the
request or transcript. If reconciliation finds divergence, unresolved risk, or
more than a bounded change, promote the work to OpenSpec and carry over ledger
evidence as links.
