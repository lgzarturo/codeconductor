# ODD Integration Plan in CodeConductor

## Decision

CodeConductor should incorporate an **ODD (Organic Delivery)** route for
authorized, day-to-day work, without adopting external agent frameworks or
replicating their skills, naming, artifacts, or runtime. ODD will be a lightweight
alternative to existing delivery workflows. OpenSpec will remain the explicit route
for delivery requiring formal artifacts and state tracking; CCEP will continue to serve
as the deterministic contract for inputs, context, and outputs.

The external pattern inspiring this design is the public Organic Delivery protocol:
explore before writing, resolve real uncertainty, create a single recoverable record
only for substantial changes, execute proportional checks, and close with evidence.
Its methodology also separates ODD from SDD by explicit choice, not by size or risk.
This plan preserves that efficiency while expressing it using native CodeConductor
concepts and mechanisms.

## Selective Analysis of External Delivery Patterns

External skill catalogs and workflows were analyzed—not to import them, but to identify
reusable patterns. The following table identifies the reusable pattern and its native
counterpart; everything else remains out of scope.

| External Skill / Pattern | Observed Value | Proposed Adaptation in CodeConductor | Decision |
| --- | --- | --- | --- |
| `external-bench` | Compare results/cost instead of assuming efficiency. | Baseline and scorecards in BC-020/BC-025. | Adopt the principle; not its benchmark or runtime. |
| `collab-handoff` | Explicit handoffs reduce lost context between agents. | Ledger + evidence link + minimal `context_scope` in BC-021/022/023. | Adapt to Task Cards and memory index. |
| `rdd-advisory-transport`, `rdd-defect-workflow` | Review must belong to an identifiable candidate. | Diff/commit hash receipt and fail-closed consensus in BC-024. | Adapt only the receipt; review remains opt-in / CC policy. |
| `issue-root-resolution`, `systemic-issue-triage` | Separating symptom, cause, and scope prevents cosmetic fixes. | Reuse `/cc-fix`, Task Coach, and the red loop; add only when classification activates it. | Already largely covered; do not create duplicate skills. |
| `cognitive-doc-design`, `comment-writer` | Useful documentation is concise, decision-oriented, and maintainable. | Concise ledger, existing ADR, and route-selection documentation in BC-025. | Adapt criteria; do not generate comments automatically. |
| `branch-pr`, `chained-pr`, `work-unit-commits` | Small, reviewable units facilitate delivery. | Maintain Task Cards/OpenSpec and scope boundaries; integrate with git only after explicit authorization. | Do not add branch/commit automation. |

## Current State Diagnosis

| Existing Capability | Source | Gap for Daily Work |
| --- | --- | --- |
| Task Card, risk classification, and ConfirmationGate | `src/core/ccep/`, `docs/routing-policy.md` | Delivery commands apply the full chain even for small, well-understood changes. |
| OpenSpec with state and Task Cards | `src/core/openspec/` | Well-suited for formal work, but not a minimal path for day-to-day changes. |
| Memory index, compaction, and budgeting | `src/core/memory/`, `src/core/compaction/`, `src/domain/loop/` | Pieces are not presented as a unified resumption contract in published workflows. |
| Scorecard and Product OS | `src/core/evaluation/`, `src/core/product-graph/` | Do not yet measure cost and quality by route to prove that ODD saves context. |
| Council with veto and consensus | `src/domain/council/`, `src/presets/council/` | Full roster is valuable for complex decisions/changes, but should not be the default overhead for every diff. |

The eight-phase `runWorkflowPipeline()` is an experimental API; it must not
become the runtime for ODD. Integration must extend CCEP profiles,
commands/presets, and existing evidence mechanisms, exposing small APIs only
when policy cannot be expressed declaratively.

## Principles and Boundaries

1. **Authorization First.** Investigation, explanation, review, and proposal
   remain read-only and create no ODD state.
2. **Explore Before Editing.** Every mutation begins with bounded wayfinding
   and verifiable classification.
3. **A Route Does Not Lower Risk.** Risk dictates gates, testing, and review;
   it does not automatically select ODD nor bypass existing approvals.
4. **Persistence Only When Enabling Recovery.** A small, well-understood change
   does not generate a durable file. A substantial one creates a single
   CodeConductor ledger before the first write.
5. **Context by Reference, Not by Transcript.** Resumption loads the ledger,
   relevant memory pointers, and current evidence; never the entire transcript
   by default.
6. **Do Not Duplicate Memory or Invent Telemetry.** The solution uses
   `.codeconductor/`, the memory index, and scorecards; it requires no external
   memory servers, MCP services, additional dependencies, or new background daemons.
7. **Single Source of Truth and Target Parity.** ODD semantics are defined once
   and rendered according to each preset's native capabilities.

## Route Selection Model

Following `wayfinding`, the orchestrator evaluates two independent decisions:

| Decision | Outcome | Rule |
| --- | --- | --- |
| Is write authorized? | read-only / delivery | Without authorization, terminate with findings; create no artifacts. |
| What coordination level is required? | small change / tracked ODD / explicit OpenSpec | A small change has a coherent modification and known checks. Tracked ODD has two or more significant steps, evidence worth recovering, or likely resumption. OpenSpec is entered via explicit request or active backlog. |

Risk continues to be evaluated in parallel. A high-risk ODD change retains
ConfirmationGate, TDD, and reviewer/complexity-auditor/security-reviewer
per existing rules. An architectural decision or public API change preserves
its contract and, where applicable, ADR/OpenSpec.

```text
request → authorization → wayfinding → real uncertainty?
                                     ├─ yes: focused question or bounded investigation
                                     └─ no
                                 → coordination classification
                                     ├─ small: minimal edit + checks
                                     ├─ ODD: ledger + tasks + evidence
                                     └─ explicit OpenSpec: existing workflow
                                 → applicable risk gates → verifiable closure
```

## Proposed ODD Contract

The proposed internal name is **Delivery Ledger**, not `odd/tasks`. For a
substantial change, it is stored as
`.codeconductor/delivery/<id>.md` and linked from `memory.md`. It is human-readable
and parseable via a sentinel-delimited YAML section, identical to the memory
index. The file contains strictly:

- Objective, authorization, scope, and exclusions;
- Exploration map (files, conventions, and observed facts);
- Tasks with stable IDs, acceptance criteria, and status;
- Significant decisions, resolved uncertainties, and links to ADR/OpenSpec;
- Verification commands and observed outcomes;
- Next action and recommended resumption context.

The ledger does not replace `BACKLOG.md`, Task Cards, `openspec/`, or Product OS.
Accepted modifications update only affected tasks and their evidence.
If there is a conflict or optional memory is missing, the local ledger is
preserved and status is reported without silent overwriting.

## Token and Coordination Optimization

| Lever | Proposed Change | Success Metric |
| --- | --- | --- |
| Minimal context | Compile each phase from Task Card/ledger, affected files, relevant pointers, and latest check results; do not resend full request or transcripts. | Context bytes and input tokens per phase. |
| Resumption | Load ledger and real working tree state first; reconcile before delegating. | Resumption without repeated questions or out-of-scope edits. |
| Compaction | After successful RED/GREEN, retain summary and evidence via existing compactor. | Compaction ratio with zero lost acceptance criteria. |
| Delegation | Single executing agent for small changes; for ODD, add specialization only when triggered by Task Card / risk. | Number of handoffs and invocations per delivery. |
| Council | Run council upon explicit request or diff/decision policy; select deterministic minimal panel based on affected domains and retain security veto. | Full reviews bypassed without compromising mandatory gates. |
| Observable cost | Extend Scorecard with route, known/unknown tokens, injected bytes, handoffs, checks, and resumptions. | ODD vs existing flows comparison demonstrating non-inferior quality. |

Budgets can only block execution when the runner provides reliable token usage.
When unavailable, usage is recorded as `unknown`; `0` is never recorded
as savings, nor is a delivery halted based on fabricated metrics.

## Council and Presets

1. Add an **applicable panel** policy derived from type, risk, and affected paths:
   architect for structural decisions; delivery for testing and release;
   data-ops for data; security-reviewer when risk signals demand it; devil for
   non-trivial changes. Product only participates when a product decision needs
   resolution. The roster remains the authoritative source of allowed roles.
2. Freeze the review candidate via diff/commit hash and attach it to each
   verdict. Results without a matching receipt are not aggregated.
3. Retain `securityVeto`, `complianceVeto`, quorum, and `criticalFindingsPolicy`.
   The reduced panel becomes `expectedAgentIds`; consensus is never simulated
   with absent agents.
4. Define a canonical ODD instruction template and generate/validate its variants
   for Codex, Claude, Cursor, Gemini, OpenCode, Agy, and Pi according to the
   capability matrix. Do not duplicate commands across targets or assume all
   environments support subagents, hooks, or token telemetry.

## Incremental Plan

### Phase 0 — Baseline and Decision Contracts (BC-020)

Document the selection tree above and add telemetry to test / scorecard
executions. Sample small changes, tracked ODD runs, and OpenSpec executions:
reported tokens, context bytes, handoffs, duration, checks, and outcomes.
Define non-regression metrics prior to prompt adjustments.

### Phase 1 — Minimal ODD Profile and Ledger (BC-021)

Introduce the `odd` command/profile and its ledger schema with
create/read/reconcile/update operations. Integrate with `ccep parse → resolve →
profile → evaluate`, existing risk classification, and `memory.md`. Keep opt-in
during this phase; existing commands maintain unchanged semantics.

### Phase 2 — Verifiable Context and Resumption (BC-022)

Build a context assembler enforcing ordering and byte budgets:
Task Card/ledger → in-scope files → relevant pointers → recent evidence.
Reuse existing compaction and track provenance for each fragment.
Test resumption against out-of-band tree modifications and unavailable memory.

### Phase 3 — Presets and Adaptive Routing (BC-023)

Publish ODD instructions from a canonical source, with rendering and parity
tests across all seven targets. Add explainable route recommendations to the
router; do not automatically execute routes without confirmation. Adjust roles
to yield minimal handoffs with links instead of redundant summaries.

### Phase 4 — Proportional Review with Receipt (BC-024)

Implement applicable panels, frozen receipts, and aggregation with dynamic rosters.
Apply the council strictly under specified conditions; preserve mandatory
reviewer, complexity, and security gates. Cover vetoes, quorum, diff drift,
and absent roles with tests.

### Phase 5 — Evaluation, Adoption, and Documentation (BC-025)

Compare baseline against a repeatable suite. Promote ODD from opt-in to
recommended route only if it reduces context/cost while preserving or improving
acceptance rates, test passes, and audit findings. Document selection criteria
among ODD, OpenSpec, TDD, and council, including resumption and escalation
to formal workflows.

## Program Acceptance Criteria

- ODD adds no external dependencies or services and does not copy external framework sources.
- A read-only request leaves no ledger and mutates no state.
- A small change creates no persistence; a tracked change can be resumed from its ledger and current evidence.
- No high-risk change bypasses existing gates when using ODD.
- All published targets receive equivalent semantics or an explicit, tested limitation.
- Scorecard comparison demonstrates context reduction with non-inferior quality results before ODD is recommended by default.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Another parallel workflow confuses the user | A selection table, a single recommended command, and explicit OpenSpec without renaming. |
| Ledger becomes a mini-OpenSpec | Fixed single-file schema without separate proposal/design/tasks; promote to OpenSpec only by choice. |
| Token savings are illusory | Baseline, `unknown` fields, per-runner comparisons, and quality gates prior to promotion. |
| Reduced council weakens security | Deterministic rules, mandatory security-reviewer on risk signals, fail-closed vetoes and quorum. |
| Divergence across presets | Canonical source, renderer, and parity/capability test coverage. |
