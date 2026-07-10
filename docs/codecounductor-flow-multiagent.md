# CodeConductor Multi-Agent Flow — Architectural Plan

> **Status:** Draft v1.0
> **Date:** 2026-07-10
> **Scope:** Workflow loop design, multi-agent orchestration, memory governance,
> guardrails, and token optimization for production-grade autonomous engineering.

---

## 1. Problem Statement

CodeConductor today orchestrates AI-assisted workflows through documented
contracts and preset-based routing. The foundation is solid:

- Council consensus engine with security veto
  ([council-consensus.ts](file:///home/alg/GitHub/codeconductor/src/domain/council/council-consensus.ts))
- 3-layer memory with pointer index
  ([memory-index.ts](file:///home/alg/GitHub/codeconductor/src/core/memory/memory-index.ts))
- Compile-fix loop with state machine
  ([loop-controller.ts](file:///home/alg/GitHub/codeconductor/src/core/loop/loop-controller.ts))
- Goal planner with DAG dependencies
  ([goal-planner.ts](file:///home/alg/GitHub/codeconductor/src/core/goal/goal-planner.ts))
- Compaction hook for TDD history
  ([compaction-hook.ts](file:///home/alg/GitHub/codeconductor/src/core/compaction/compaction-hook.ts))
- Agent contracts with multi-target rendering
  ([agent-contract.ts](file:///home/alg/GitHub/codeconductor/src/domain/council/agent-contract.ts))

**What is missing:**

1. A unified workflow loop that combines DDD→SDD→TDD into a single deterministic
   pipeline
2. Autonomous memory governance — agents cannot self-heal contradictory context
3. Guardrails beyond prompt-level instructions — no operational limits, no output
   scanning
4. Token budget awareness — no active context compaction during execution
5. Adversarial testing — TDD is happy-path oriented
6. Council delegation authentication — any agent can invoke any other

This plan defines a **minimalist, functional multi-agent workflow loop** that
addresses these gaps without overbuilding. Every component traces to a real
problem observed in the current system.

---

## 2. Design Principles

These are non-negotiable. They override complexity in every tradeoff.

| Principle | Enforcement |
| --- | --- |
| **Ponytail minimalism** | No component exists without a traced problem. No abstractions for single-use code. |
| **Karpathy conciseness** | Agent outputs are structured data (diffs, commands, tool calls). Zero explanatory prose unless `/explain` is invoked. |
| **40KB file limit** | All generated preset files (AGENTS.md, CLAUDE.md, etc.) remain ≤ 40KB. Memory index enforces this via `truncateToSize()`. |
| **Stdlib-first** | `node:fs`, `node:path`, `node:crypto` before any npm dependency. |
| **Deterministic routing** | Task Card → Risk classification → Agent route. No implicit decisions. |
| **Human at the boundary** | STOP gates at specification approval and merge decision. Agents never push. |

---

## 3. The Workflow Loop

This is the core pipeline. It replaces ad-hoc workflow selection with a single
deterministic loop that all `/cc-*` commands can invoke.

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW LOOP                             │
│                                                             │
│  1. INTAKE ──→ 2. STRUCTURE ──→ 3. DESIGN (SDD)            │
│       │              │                │                     │
│       ▼              ▼                ▼                     │
│  raw request   Task Card XML    Technical Plan              │
│                                 + Edge Case Matrix          │
│                                       │                     │
│                         ┌─────────────┘                     │
│                         ▼                                   │
│                  4. TEST (RED) ──→ 5. IMPLEMENT (GREEN)     │
│                         │                │                  │
│                         ▼                ▼                  │
│                  failing tests    minimal code              │
│                                       │                     │
│                         ┌─────────────┘                     │
│                         ▼                                   │
│                  6. VALIDATE ──→ 7. COUNCIL VERDICT         │
│                         │                │                  │
│                         ▼                ▼                  │
│                  mutation test    APPROVED / BLOCKED         │
│                  + diff audit    + ESCALATED                │
│                                       │                     │
│                         ┌─────────────┘                     │
│                         ▼                                   │
│                  8. COMPACT ──→ deliver                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Phase Definitions

#### Phase 1 — INTAKE

**Agent:** `task-coach` (or `prompt-structurer` for optimization)
**Input:** Raw user request (free text)
**Output:** Structured Task Card

The intake phase transforms ambiguous human language into a validated Task Card.
If the request is already structured, this phase is a pass-through.

Task Card validation requires all fields from
[task-card-template.md](file:///home/alg/GitHub/codeconductor/docs/task-card-template.md):
title, type, risk, scope, context, context_scope, acceptance criteria.

#### Phase 2 — STRUCTURE (Context Optimization)

**Agent:** `prompt-structurer` (new, lightweight)
**Input:** Validated Task Card
**Output:** Compacted Task Card with XML delimiters

This phase applies the **Context Compaction Pipeline**:

1. Strip the Task Card of redundant prose
2. Wrap structured fields in XML delimiters (`<context>`, `<constraints>`,
   `<task>`, `<scope>`)
3. Resolve file references to AST signatures (function names, type definitions)
   instead of full file contents
4. Attach only the relevant memory pointers from `memory.md`

The goal is to minimize tokens sent to the heavy-reasoning agent in Phase 3.

> **Implementation note:** The `prompt-structurer` should be a fast, cheap agent
> (Flash-tier model). It is not a decision-maker — it is a formatter.

#### Phase 3 — DESIGN (SDD)

**Agent:** `architect`
**Input:** Compacted Task Card + AST signatures of affected files
**Output:** Technical Plan + Edge Case Matrix

The architect produces two artifacts:

1. **Technical Plan** — approach, tradeoffs, files affected, risks (existing
   format from [cc-feature.md](file:///home/alg/GitHub/codeconductor/.agents/workflows/cc-feature.md))
2. **Edge Case Matrix** — a structured table of failure scenarios (new)

Edge Case Matrix format:

```markdown
## Edge Case Matrix

| # | Scenario | Input | Expected | Risk |
|---|----------|-------|----------|------|
| 1 | Empty array | `[]` | Returns empty result | low |
| 2 | Network failure mid-transaction | timeout after 5s | Rollback, return error | high |
| 3 | Input exceeds max size | 10MB payload | 413 error, no processing | medium |
```

The architect reads AST signatures (not full files) to design the solution. This
enforces Ponytail minimalism — the agent cannot see code it does not need to
change.

**STOP GATE:** Human approves the Technical Plan before Phase 4.

#### Phase 4 — TEST (RED)

**Agent:** `adversarial-tester` (new role, extends `tester`)
**Input:** Technical Plan + Edge Case Matrix + Acceptance Criteria
**Output:** Failing test suite

The adversarial-tester writes tests targeting:

1. Every acceptance criterion from the Task Card (happy path)
2. Every row in the Edge Case Matrix (failure paths)
3. At least one boundary condition per input parameter

Tests must fail for the correct reason (missing implementation, not compile
errors). This follows the existing RED phase discipline from
[cc-tdd-cycle.md](file:///home/alg/GitHub/codeconductor/.agents/workflows/cc-tdd-cycle.md).

The adversarial-tester is distinct from `tester` in one way: it is contractually
obligated to write tests that **attempt to break** the implementation, not
just validate it.

#### Phase 5 — IMPLEMENT (GREEN)

**Agent:** `implementer`
**Input:** Failing tests + Technical Plan + Compacted context
**Output:** Minimal code that passes all tests

Rules (existing from `cc-tdd-cycle.md`):

- Write the smallest amount of code that makes tests pass
- Touch ONLY files in the Technical Plan scope
- No refactoring, no new tests, no explanatory comments
- Output format: diffs only (Anti-Yapping contract)

The implementer receives **compacted context** — not the full conversation
history. The `prompt-structurer` runs again before this phase to strip
Phase 3 and 4 outputs down to essential information.

**Loop:** If tests fail, cycle `implementer` → `tester` up to 3 iterations
(existing `loop-controller.ts` behavior). If stuck after 3 iterations, ESCALATE
to human.

#### Phase 6 — VALIDATE

**Agent:** `tester` + mutation engine
**Input:** Passing test suite + implementation diff
**Output:** Validation report (mutation score, diff audit)

Two validations run:

1. **Mutation Testing** — The engine mutates the implementation (swap operators,
   remove conditions, change return values) and re-runs the test suite. If tests
   still pass after a mutation, the test is insufficient.

2. **Diff Audit** — Verify the implementation touches only files listed in the
   Technical Plan scope. Any out-of-scope change is flagged as scope creep.

Mutation test output:

```markdown
## Mutation Report

Mutants generated: 12
Mutants killed: 10
Mutants survived: 2
Mutation score: 83%

### Surviving Mutants
1. `src/service.ts:42` — changed `>` to `>=` — tests still pass
2. `src/handler.ts:18` — removed null check — tests still pass
```

If mutation score < 80%, the task returns to Phase 4 for stricter assertions.

#### Phase 7 — COUNCIL VERDICT

**Agent:** Council (multi-agent review)
**Input:** Implementation diff + Validation report + Technical Plan
**Output:** Verdict: APPROVED | BLOCKED | ESCALATED

The Council evaluates the diff against the existing 6 axes (from
[council-consensus.ts](file:///home/alg/GitHub/codeconductor/src/domain/council/council-consensus.ts)):

| Axis | Agent | Focus |
|------|-------|-------|
| Architecture | `architect` | Structure, patterns, coupling |
| Security | `security-reviewer` | OWASP, secrets, injection (veto power) |
| Product | `product` | Requirements match, UX |
| Delivery | `delivery` | Test coverage, deployment readiness |
| Compliance | `compliance-auditor` (new) | PII exposure, regulatory |
| Devil | `devil` | Edge cases, failure modes |

Council consensus uses the existing `councilConsensus()` function with
`majority` algorithm and `allowSecurityVeto: true`.

**Additions to current Council:**

- `compliance-auditor` — scans output for PII patterns, license violations,
  credential exposure. Has veto power via `securityVeto` flag.
- **Minimal Diff Gate** — The Council penalizes (CRITICAL finding) if the
  implementer modified files outside the Technical Plan scope.
- **Simplicity Gate** — The Council flags (WARNING) if the implementation
  imports third-party dependencies for tasks solvable with stdlib.

If BLOCKED: return to Phase 5 with Council feedback.
If ESCALATED: surface to human review.

#### Phase 8 — COMPACT

**Agent:** System (compaction-hook)
**Input:** Completed task + history
**Output:** Compacted summary + memory pointer update

After the Council approves:

1. Run `compactAfterTestPass()` (existing
   [compaction-hook.ts](file:///home/alg/GitHub/codeconductor/src/core/compaction/compaction-hook.ts))
   to clear RED/GREEN iteration history
2. Write a memory pointer to `.codeconductor/memory.md` via `addPointer()`
   (existing API) summarizing the completed task
3. Deliver the final summary to the human

---

## 4. Memory Architecture: 3-Layer Self-Healing

The existing 3-layer memory is functional but passive. Agents read memory but
cannot correct it. This section adds self-healing capability.

### 4.1 Current State (Implemented)

```
Layer 1: Session History    → ephemeral, in-memory
Layer 2: Compaction Cache   → .codeconductor/history.jsonl (per-session)
Layer 3: Memory Index       → .codeconductor/memory.md (persistent, 40KB max)
```

The memory index API (`loadMemoryIndex`, `saveMemoryIndex`, `addPointer`,
`updatePointer`, `deletePointer`, `findByTopicKey`) is fully implemented in
[memory-index.ts](file:///home/alg/GitHub/codeconductor/src/core/memory/memory-index.ts).

### 4.2 Self-Healing Extension

Add two capabilities to the existing memory API:

#### `write_memory` — Agent-initiated memory update

When an agent discovers that a previous decision was incorrect (e.g., the
architect realizes a chosen pattern does not work), it can write a correction:

```typescript
// New function in memory-index.ts
export function correctPointer(
  index: MemoryIndex,
  topic_key: string,
  correction: { summary: string; reason: string },
): MemoryIndex {
  const existing = findByTopicKey(index, topic_key);
  if (existing.length === 0) {
    // Add new pointer if topic doesn't exist
    return addPointer(index, {
      topic_key,
      id: Date.now(),
      file: `corrections/${topic_key.replace(/\//g, '-')}.md`,
      summary: `CORRECTED: ${correction.summary}`,
      timestamp: new Date().toISOString(),
      tags: ['correction', 'self-heal'],
    });
  }
  // Update existing pointer with correction marker
  return updatePointer(index, topic_key, {
    summary: `CORRECTED: ${correction.summary} (was: ${existing[0]!.summary})`,
    timestamp: new Date().toISOString(),
    tags: [...(existing[0]!.tags ?? []), 'corrected'],
  });
}
```

#### `reconcile` — Periodic consistency check

The `/cc-reconcile` command triggers a read-only scan of all memory pointers:

1. Load `memory.md`
2. For each pointer, verify the referenced file still exists
3. Flag contradictions: two pointers on the same topic with conflicting summaries
4. Flag stale pointers: timestamp older than configurable threshold (default: 30
   days)
5. Output a reconciliation report (no automatic deletes — human approves)

### 4.3 Static Configuration Isolation

Immutable project rules live in `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` (loaded
at session start). Mutable observations live in `memory.md` (loaded on demand).
This separation already exists in the codebase — the plan formalizes it.

```
Immutable (session start):    AGENTS.md, CLAUDE.md, GEMINI.md, policy.yml
Mutable (on demand):          .codeconductor/memory.md
Ephemeral (per session):      .codeconductor/history.jsonl
```

---

## 5. Council Governance: Delegation and Trust

### 5.1 Delegation Credentials

When an agent delegates work to another, the request includes a credential:

```typescript
interface DelegationCredential {
  readonly fromAgent: string;      // e.g. 'orchestrator'
  readonly fromRole: string;       // e.g. 'Coordinator'
  readonly toAgent: string;        // e.g. 'implementer'
  readonly taskId: string;         // from GoalGraph
  readonly permissions: string[];  // e.g. ['edit:src/**', 'bash:test']
  readonly timestamp: string;      // ISO 8601
}
```

The receiving agent validates:
- `fromAgent` has delegation authority (defined in routing policy)
- `permissions` are within the sender's own permission set (no escalation)
- `taskId` exists in the current goal graph

This is enforced at the prompt/contract level — not runtime — matching
CodeConductor's current declarative enforcement model.

### 5.2 Confidence Thresholds

Add a confidence field to Council verdicts:

```typescript
interface CouncilVerdictInput {
  // ... existing fields
  readonly confidence: number; // 0.0 to 1.0
}
```

Consensus rules extension:
- If any agent's confidence < 0.6, the verdict includes an `ESCALATED` flag
  with the low-confidence agent identified
- If average confidence across all agents < 0.7, auto-escalate to human
  regardless of majority vote

### 5.3 Precedence Rules

When conflicts arise between agents, the following hierarchy applies:

```
1. security-reviewer (veto power — overrides all)
2. compliance-auditor (veto power — PII/regulatory)
3. architect (design authority — tie-breaker on structure)
4. devil (advisory — challenges but does not block)
5. product / delivery (advisory)
```

This hierarchy is enforced by the `councilConsensus()` function. The existing
`securityVeto` mechanism already handles level 1. Level 2 uses the same
mechanism with a new `complianceVeto` flag.

---

## 6. Guardrails: 4-Layer Defense

### Layer 1 — Prompt (Existing)

Agent contracts define permissions, denied commands, and behavioral rules.
Already implemented in `AGENTS.md`, `CLAUDE.md`, `policy.yml`.

### Layer 2 — Operational (New)

Runtime limits enforced by the loop controller:

```typescript
interface OperationalGuardrails {
  maxIterations: number;        // existing: 3 (loop-controller.ts)
  maxTokenBudget: number;       // existing: configurable (loop-controller.ts)
  maxWallClockSeconds: number;  // new: prevent runaway sessions
  maxFilesModified: number;     // new: scope creep detection
  maxLinesChanged: number;      // new: diff size limit
}
```

The `loop-controller.ts` already enforces `maxIterations` and
`maxTokenBudget`. Adding `maxWallClockSeconds`, `maxFilesModified`, and
`maxLinesChanged` requires minimal changes to the existing `LoopConfig`
interface.

### Layer 3 — Execution Isolation (Planned)

Code generated during TDD cycles runs in isolated environments:

- **Current:** Git worktrees (documented in workflows, partially enforced)
- **Future:** Sandbox execution for test commands (depends on target tool
  capabilities — e.g., Antigravity sandbox, Claude Code sandbox)

This layer is **documented intent**, not implemented code, matching
CodeConductor's current declarative model.

### Layer 4 — Output Scanning (New)

Before any diff is committed or delivered, scan for:

1. **Credential patterns** — regex from `policy.yml.secretPatterns` (already
   defined: `password`, `secret`, `api_key`, `token`, etc.)
2. **PII patterns** — email, phone, SSN, credit card (new patterns added to
   `policy.yml`)
3. **License violations** — imports from known restrictive-license packages

The output scanner is a function that runs after Phase 5 (IMPLEMENT) and before
Phase 7 (COUNCIL):

```typescript
interface OutputScanResult {
  readonly clean: boolean;
  readonly findings: Array<{
    type: 'credential' | 'pii' | 'license';
    file: string;
    line: number;
    pattern: string;
    severity: 'critical' | 'warning';
  }>;
}
```

Any `critical` finding blocks the Council review automatically.

---

## 7. Token Optimization: Context Compaction Pipeline

### 7.1 AST Filtering (`analyze_ast` Skill)

Instead of loading full source files, agents receive AST summaries:

```typescript
interface ASTSummary {
  file: string;
  exports: Array<{
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'const';
    signature: string;  // e.g., "function planGoal(objective: string): GoalGraphInput"
    line: number;
  }>;
  imports: string[];
  lineCount: number;
}
```

The `analyze_ast` skill extracts signatures using the existing LSP
infrastructure (see `src/core/lsp/`). Only when an agent needs to modify a
function body does it request the full content.

### 7.2 Active Pruning

After each phase completes, the orchestrator prunes the context:

1. Tool output from Phase N is summarized into ≤ 500 chars
2. Full output is written to `history.jsonl` (existing compaction path)
3. Next phase receives only the summary + its specific inputs

### 7.3 Token Audit Command (`/cc-audit-tokens`)

A diagnostic command that reports:

```
## Token Budget Report

Phase          | Input Tokens | Output Tokens | Files Loaded
-------------- | ------------ | ------------- | ------------
INTAKE         |        1,200 |           800 | 0
STRUCTURE      |          800 |           400 | 0
DESIGN (SDD)   |        3,500 |         2,100 | 4 (AST only)
TEST (RED)     |        2,800 |         1,500 | 2
IMPLEMENT      |        4,200 |         3,000 | 3
VALIDATE       |        1,800 |           600 | 0
COUNCIL        |        5,500 |         2,000 | 0 (diff only)
COMPACT        |          200 |           100 | 0
-------------- | ------------ | ------------- | ------------
TOTAL          |       20,000 |        10,500 | 9

Budget remaining: 29,500 / 50,000
Top consumers: COUNCIL (37%), IMPLEMENT (27%), DESIGN (18%)
```

---

## 8. New Components

### 8.1 New Agents

| Agent | Role | Model Tier | Veto Power |
|-------|------|------------|------------|
| `prompt-structurer` | Format and compact Task Cards | Flash (cheap) | No |
| `adversarial-tester` | Write failure-focused tests | Balanced | No |
| `compliance-auditor` | Scan for PII/regulatory violations | Analytical | Yes |
| `memory-broker` | Coordinate concurrent memory writes | Flash (cheap) | No |

### 8.2 New Commands

| Command | Type | Description |
|---------|------|-------------|
| `/cc-reconcile` | Workflow | Scan memory for contradictions and stale pointers |
| `/cc-audit-tokens` | Diagnostic | Report token consumption by phase |
| `/cc-pipeline` | Workflow | Run the full 8-phase workflow loop |

### 8.3 New Skills

| Skill | Purpose |
|-------|---------|
| `analyze_ast` | Extract function signatures and type definitions from source files |
| `update_index` | Agent-callable memory pointer update with validation |
| `mutation-test` | Run mutation testing on a given test suite and implementation |
| `output-scanner` | Scan diffs for credentials, PII, and license violations |

---

## 9. Anti-Yapping Contract

All conductor agents except `task-coach` and `docs` operate under the
Anti-Yapping contract:

```markdown
## Output Format Contract

You MUST return ONLY:
- Tool calls (MCP, file edit, terminal commands)
- Code diffs (unified diff format)
- Structured reports (markdown tables, YAML blocks)

You MUST NOT return:
- Greetings, acknowledgments, or sign-offs
- Explanations of what you are about to do
- Justifications for your decisions (use `/explain` if needed)
- Summaries of what you just did (the report IS the summary)
```

This contract is embedded in agent prompts, not in runtime enforcement. It
reduces output tokens by ~40% based on observed agent behavior.

---

## 10. Implementation Priority

Ordered by value and dependency. Each phase is independently useful.

### Phase A — Workflow Loop Core (Highest Value)

**Files affected:**
- New: `src/core/pipeline/workflow-loop.ts`
- New: `.agents/workflows/cc-pipeline.md`
- Modified: `src/core/loop/loop-controller.ts` (add operational guardrails)
- Modified: `src/domain/council/council-consensus.ts` (add confidence threshold)

**Acceptance criteria:**
- [ ] The 8-phase loop executes end-to-end for a simple feature request
- [ ] STOP gates pause execution at Phase 3 and Phase 7
- [ ] Loop controller respects `maxWallClockSeconds` and `maxFilesModified`
- [ ] Existing workflows (`/cc-feature`, `/cc-tdd-cycle`) can invoke the loop

### Phase B — Adversarial Testing + Edge Case Matrix

**Files affected:**
- New: `.agents/skills/adversarial-tester/SKILL.md`
- Modified: `.agents/workflows/cc-tdd-cycle.md` (add Edge Case Matrix to RED)
- New: `src/core/mutation/mutation-runner.ts`

**Acceptance criteria:**
- [ ] Architect produces Edge Case Matrix alongside Technical Plan
- [ ] Adversarial-tester writes tests from Edge Case Matrix
- [ ] Mutation runner detects surviving mutants
- [ ] Mutation score < 80% triggers return to RED phase

### Phase C — Memory Self-Healing

**Files affected:**
- Modified: `src/core/memory/memory-index.ts` (add `correctPointer()`)
- New: `.agents/workflows/cc-reconcile.md`
- New: `src/core/memory/reconcile.ts`

**Acceptance criteria:**
- [ ] Agent can correct a stale memory pointer via `correctPointer()`
- [ ] `/cc-reconcile` produces a report of stale and contradictory pointers
- [ ] No automatic deletes — human approves reconciliation

### Phase D — Context Compaction

**Files affected:**
- New: `.agents/skills/analyze-ast/SKILL.md`
- New: `src/core/context/ast-extractor.ts`
- New: `.agents/workflows/cc-audit-tokens.md`

**Acceptance criteria:**
- [ ] Architect receives AST signatures instead of full file contents
- [ ] Implementer receives compacted context (≤ 50% of naive token usage)
- [ ] `/cc-audit-tokens` reports per-phase token consumption

### Phase E — Output Scanning + Compliance Auditor

**Files affected:**
- New: `src/core/security/output-scanner.ts`
- Modified: `policy.yml` (add PII patterns)
- Modified: `src/domain/council/council-spec.ts` (add compliance-auditor)
- New: `.agents/skills/output-scanner/SKILL.md`

**Acceptance criteria:**
- [ ] Output scanner detects credential patterns from `policy.yml`
- [ ] Output scanner detects PII patterns (email, phone, SSN)
- [ ] Compliance-auditor participates in Council with veto power
- [ ] Critical scan findings block Council approval

### Phase F — Delegation Credentials + Memory Broker

**Files affected:**
- New: `src/core/security/delegation.ts`
- New: `.agents/skills/memory-broker/SKILL.md`
- Modified: `src/domain/council/agent-contract.ts` (add DelegationCredential)

**Acceptance criteria:**
- [ ] Agent delegation includes credential with permission scope
- [ ] Receiving agent validates credential against routing policy
- [ ] Memory broker prevents concurrent write conflicts
- [ ] Memory broker serializes writes from parallel agents

---

## 11. What This Plan Does NOT Include

Explicit exclusions to prevent scope creep:

- **Runtime orchestrator process** — CodeConductor remains a documentation-first
  framework. The workflow loop is encoded in workflow files and agent contracts,
  not a daemon.
- **Web dashboard** — Out of scope per ROADMAP.md.
- **Agent marketplace** — Out of scope per ROADMAP.md.
- **MicroVM/container isolation** — Documented as future intent. Current
  isolation depends on target tool capabilities (sandbox, worktree).
- **Multi-tenant team policies** — Out of scope per ROADMAP.md.
- **Automated PR creation** — Agents produce diffs. Humans create PRs.

---

## 12. Compatibility Matrix

This plan produces artifacts that work across all supported agent targets:

| Component | Claude Code | Codex | Gemini | AGY | OpenCode |
|-----------|------------|-------|--------|-----|----------|
| Workflow loop (cc-pipeline.md) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Anti-Yapping contract | ✓ | ✓ | ✓ | ✓ | ✓ |
| Memory index API | ✓ | ✓ | ✓ | ✓ | ✓ |
| Council consensus | ✓ | ✓ | ✓ | ✓ | ✓ |
| Delegation credentials | ✓ | ✓ | ✓ | ✓ | ✓ |
| Output scanning | ✓ | ✓ | ✓ | ✓ | ✓ |
| AST extraction | Target-dependent | Target-dependent | Target-dependent | Target-dependent | Target-dependent |
| Mutation testing | Target-dependent | Target-dependent | Target-dependent | Target-dependent | Target-dependent |

All components render to the target's agent file format via the existing
`ContractTarget` system in
[agent-contract.ts](file:///home/alg/GitHub/codeconductor/src/domain/council/agent-contract.ts).
The 40KB preset file limit is enforced by the existing `MAX_SIZE_BYTES`
constant in `memory-index.ts` and by the preset renderer's output validation.

---

## 13. Verification Checklist

Before this plan is considered complete, the following must be true:

- [ ] All 8 phases of the workflow loop have documented inputs and outputs
- [ ] Each new agent has a defined role, model tier, and permission set
- [ ] Each new command has a workflow file in `.agents/workflows/`
- [ ] Each new skill has a `SKILL.md` in `.agents/skills/`
- [ ] No generated preset file exceeds 40KB
- [ ] Existing tests continue to pass after changes
- [ ] The workflow loop can be invoked from any `/cc-*` command
- [ ] Human STOP gates exist at specification and merge boundaries
- [ ] Memory self-healing does not auto-delete without human approval
- [ ] Output scanner patterns are configurable via `policy.yml`
