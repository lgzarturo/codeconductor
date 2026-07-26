# Council steering — roster, vetoes, and consensus

The council is a multi-agent review body. Each agent returns a verdict; the
consensus engine reduces those verdicts to a single decision:
`APPROVED`, `REJECTED`, or `ESCALATED`.

**Sources of truth:**
- Roster preset: `src/presets/council/council.yml`
- Code defaults: `src/domain/council/council-spec.ts`
- Consensus engine: `src/domain/council/council-consensus.ts`

---

## Roster

The bundled preset (`council.yml`) ships **six** agents:

| id | Role | Context | Model hint | Focus |
| --- | --- | --- | --- | --- |
| `architect` | Architect | repo-readonly | strong-reasoning | architecture, design-patterns, code-structure |
| `security` | Security | repo-readonly | security-reasoning | security, vulnerabilities, compliance |
| `product` | Product | prompt-only | balanced | requirements, ux, business-value |
| `delivery` | Delivery | repo-readonly | practical-coding | delivery, testing, deployment |
| `data-ops` | DataOps | repo-readonly | analytical | data, pipelines, analytics |
| `devil` | Devil | repo-readonly | adversarial | review, edge-cases, failure-modes |

> **Divergence to reconcile:** `DEFAULT_COUNCIL_AGENTS` in
> `council-spec.ts` defines **seven** agents — the six above plus
> `security-reviewer` (security-reasoning; credentials, injection, auth,
> supply-chain). Keep the preset and the code default aligned, or declare which
> one is canonical. Tracked in `docs/reports/2026-07-audit.md`.

An alternate roster, `SEO_HOTEL_COUNCIL_AGENTS`, provides five domain agents
(`seo-auditor`, `schema-validator`, `geo-specialist`, `content-strategist`,
`astro-specialist`) for SEO workflows.

`context` is either `repo-readonly` (the agent may read the repository) or
`prompt-only` (the agent sees only the compiled prompt). `modelHint` steers model
selection per agent.

---

## Verdict inputs

Each agent contributes a `CouncilVerdictInput`:

```ts
{
  agentId: string;
  agentRole: string;
  status: 'APPROVED' | 'REJECTED' | 'ABSTAIN';
  securityVeto: boolean;
  complianceVeto?: boolean;
  confidence?: number;          // defaults to 1.0 when omitted
  findings: CouncilFinding[];   // { category, severity, message, agentId }
  summary: string;
}
```

Consensus is configured with `ConsensusConfig`:

```ts
{
  algorithm: 'majority' | 'unanimous';
  allowSecurityVeto: boolean;
  allowComplianceVeto?: boolean; // defaults to true
}
```

The default config is `{ algorithm: 'majority', allowSecurityVeto: true, allowComplianceVeto: true }`.

---

## Decision order

`councilConsensus(verdicts, config)` evaluates in this precedence:

1. **Empty input** → `ESCALATED` (nothing to decide).
2. **Vetoes** (evaluated before everything else): a `REJECTED` verdict with
   `securityVeto` (when `allowSecurityVeto`) or `complianceVeto` (when
   `allowComplianceVeto`) forces `REJECTED` regardless of the majority. The
   vetoing agent is recorded in `vetoByAgentId`.
3. **Confidence thresholds** → `ESCALATED` if **any** agent reports
   `confidence < 0.6`, or if the **average** confidence `< 0.7`.
4. **Algorithm**:
   - `majority`: `APPROVED` when `approvedCount > rejectedCount`.
   - `unanimous`: `APPROVED` only when `rejectedCount === 0`.
5. **No clear outcome** → `ESCALATED`.

The result (`CouncilVerdict`) carries the tallies (`approvedCount`,
`rejectedCount`, `abstainedCount`), veto flags, `averageConfidence`, the merged
`findings`, a human-readable `summary`, and the original `individualVerdicts`.

---

## Design intent

- **Safety and compliance are non-negotiable.** A single security or compliance
  veto outweighs any majority — the council cannot "outvote" a blocking risk.
- **Low confidence escalates rather than guesses.** When the panel is unsure, the
  decision goes to a human instead of defaulting to approve or reject.
- **`ABSTAIN` is neutral.** Abstentions count toward the total and the average
  confidence but do not push the majority either way.

This engine is invoked by the SDD pipeline at phase 7 (`docs/SDD.md`); a
`REJECTED` or `ESCALATED` verdict stops the loop before changes land.
