## Technical Plan — Phase 5: Memory Compression & Token Savings

**Task:** Implement micro-context injection, compaction hooks, concise inter-agent
messages, and token budget enforcement.
**Approach:** Four independent, composable modules — ContextInjector (scope-driven
file filtering), HistoryCompactor (summary-only after TDD), message format
tightening in prompt contracts, and TokenTracker (enforce existing
maxTokenBudget placeholders). All changes are behavioral in prompts/config OR
stdlib-only TypeScript with no new dependencies.

---

### Tradeoffs

- **Chosen**: Four independent modules with shared budget constants.
  **Because**: Each mechanism addresses a distinct acceptance criterion and can
  ship independently. Shared constants (e.g., `PRESET_MAX_BYTES = 40_000`)
  satisfy Karpathy principles without coupling modules.

- **Rejected**: A monolithic `MemoryManager` class that owns all four concerns.
  **Because**: Violates single responsibility — the loop controller should not
  know about TDD workflow compaction, and the context injector should not know
  about token budgets. Composition over inheritance.

- **Rejected**: A runtime hook system (e.g., event emitters on `runLoop`).
  **Because**: Phase 5 needs three behaviors — context filtering, history
  clearing, and budget enforcement. A hook system is overbuilt for three
  callbacks. YAGNI. Add hooks only when the pattern repeats a third time.

---

### Files Affected

#### Modified

| File | Change | Why |
|------|--------|-----|
| `src/domain/loop/loop-state.ts` | Add `TOKEN_BUDGET_EXCEEDED` action; implement `tokenBudgetExceeded()` check in state machine; validate budget on `CODE_GENERATED` transition | Enforce existing `maxTokenBudget`/`tokenBudgetUsed` placeholders |
| `src/core/loop/loop-controller.ts` | Change `GenerateFn` signature to `(feedback?: string) => Promise<{ tokenUsage: number }>`; accumulate `tokenBudgetUsed` on each generate call; emit `TOKEN_BUDGET_EXCEEDED` action when budget breached; call state machine with token usage | Wire token budget enforcement into the loop runner |
| `src/validation/schemas.ts` | Add `ScopeConstraintSchema` and `ContextInjectConfigSchema`; add `maxTokenBudget` to `LoopConfigSchema` if missing | Validate scope-driven context config at startup |
| `.agents/prompts/v0.3.0/orchestrator.md` | Remove "Orchestrator Report" self-summary output block; replace with concise routing/status only; add rule "Never produce a self-summary" | Eliminate verbose orchestrator output |
| `.agents/skills/cc-tdd-cycle/SKILL.md` | Add compaction step after GREEN Phase Report: clear detailed RED/GREEN history, pass only TDD Cycle Summary | Clear history after TDD tests pass |
| `docs/task-card-template.md` | Clarify that `Scope / Files` drives context injection for `isolated` and `continuation` scopes | Document the new behavior |

#### Created

| File | What it does |
|------|-------------|
| `src/core/context/context-injector.ts` | Reads Task Card Scope block (list of files), filters the full workspace file tree to only those files, returns `ContextPayload` with the scoped file contents. Exported: `injectContext(config, scope, workspacePath)` |
| `src/core/context/context-types.ts` | Shared types: `ContextPayload`, `ScopeConstraint`, `ContextInjectConfig` |
| `src/core/context/token-tracker.ts` | Pure function: `trackTokens(used: number, budget: number): TokenState`. Returns `{ exceeded: boolean, remaining: number, totalUsed: number }` |
| `src/core/context/history-compactor.ts` | Reads a TDD cycle's history and produces a compact summary (max 4KB). Exported: `compactTddHistory(history: TddHistory): string` |
| `docs/adr/adr-010-phase5-memory-compression.md` | Architecture Decision Record (already written) |

---

### 1. Micro-Context Injection

**How Task Card Scope drives context selection:**

The Task Card's `Scope / Files` block contains an explicit list of files. The
orchestrator (prompt-defined behavior) already reads this field. The new
behavior:

1. During SDD/TDD phases, the orchestrator injects `/new` when `context_scope`
   is `isolated` (existing behavior).

2. After `/new`, the orchestrator appends the file list from the Task Card Scope
   as the only files the agent should read. This is a delegation instruction, not
   a code-level enforcement: the agent is told to work within those files.

3. The `ContextInjector` module provides a programmatic utility that:
   - Accepts a `ScopeConstraint` (list of file paths from Task Card)
   - Resolves them against the actual workspace
   - Returns a `ContextPayload` with the file contents pre-read (for injection
     into the agent prompt)

**Module contract:**

```typescript
// src/core/context/context-types.ts
export interface ScopeConstraint {
  files: readonly string[];     // glob-compatible paths from Task Card
  boundaries: readonly string[]; // must-not-touch paths
}

export interface ContextInjectConfig {
  scope: ScopeConstraint;
  contextScope: 'isolated' | 'continuation' | 'full';
  maxContextBytes: number;       // default: 40_000
}

export interface ContextPayload {
  files: readonly FileContext[]; // only scoped files
  totalBytes: number;
  truncated: boolean;            // true if some files were skipped due to budget
}

export interface FileContext {
  path: string;
  content: string;               // entire file content
  bytes: number;
}
```

```typescript
// src/core/context/context-injector.ts
// Exported function:
export async function injectContext(
  config: ContextInjectConfig,
  workspacePath: string
): Promise<ContextPayload>;
```

**Behavior matrix:**

| `context_scope` | What the agent receives |
|----------------|------------------------|
| `isolated`     | Only files listed in Scope block, `/new` first |
| `continuation` | Prior context + only files in Scope block |
| `full`         | All prior context + all workspace files (no filtering) |

**Key invariant:** For `isolated` scope, the context payload MUST NOT exceed
`maxContextBytes`. If it would, the injector truncates and sets
`truncated: true`, so the orchestrator can warn.

---

### 2. Compaction Hook

**Where:** `.agents/skills/cc-tdd-cycle/SKILL.md` — after Phase 2 GREEN Phase
Report.

**What it does:** Before proceeding to Phase 3 REFACTOR, the workflow clears the
detailed RED and GREEN phase transcripts from conversation history. Only the
RED Phase Report and GREEN Phase Report (already concise tables) are preserved as
context.

**Implementation:** This is a **workflow-level instruction** added to the TDD
cycle skill file. No TypeScript code is required. The compaction is behavioral:
the agent is instructed to summarize and discard detailed history.

**New step added to SKILL.md:**

```
### 2d — Compaction (after GREEN confirmed)

After the GREEN Phase Report is confirmed and before proceeding to REFACTOR:

1. Clear all detailed conversation history from RED and GREEN phases
2. Retain only:
   - The original Task Card / scope
   - The RED Phase Report summary
   - The GREEN Phase Report summary
3. This ensures the REFACTOR phase starts with a clean context window
```

**History compactor utility (`src/core/context/history-compactor.ts`):**

For the 50-iteration simulation, a programmatic utility is needed:

```typescript
export interface TddPhaseResult {
  phase: 'RED' | 'GREEN' | 'REFACTOR';
  summary: string;       // ≤ 2KB
  historyBytes: number;  // raw history size before compaction
}

export interface CompactionResult {
  summary: string;       // aggregated ≤ 4KB
  bytesBefore: number;
  bytesAfter: number;
  compactionRatio: number;
}

export function compactTddHistory(
  history: readonly TddPhaseResult[]
): CompactionResult;
```

---

### 3. Concise Inter-Agent Messages

**Changes to `.agents/prompts/v0.3.0/orchestrator.md`:**

1. **Remove** the `## Orchestrator Report` output block (lines 327-349).

2. **Replace** with a minimal routing decision format:

```markdown
## Routing

[task-id] → [agent1] → [agent2] → ...
```

3. **Add hard rule:** "Never produce a self-summary. Your only output is the
   routing decision and delegation instructions. No status blocks, no findings
   blocks, no 'next steps'."

4. **Add concise output rule to all agent contracts:** Each agent produces EXACTLY
   one output: the deliverable specified in its contract. No preamble, no "I
   will now...", no "Let me verify...". The contract IS the output format.

**Scope of this change:** Only the orchestrator prompt and the shared behavioral
discipline section. Individual agent contracts (architect, implementer, tester,
reviewer) already have defined output formats (Technical Plan, Implementation
Summary, etc.) — those stay exactly as they are. The change is removing the
*extra* verbosity around those formats.

**No code changes needed** — this is entirely prompt-level.

---

### 4. Token Budget Enforcement

**Current state (before Phase 5):**

- `LoopConfig.maxTokenBudget` is defined (loop-controller.ts:20)
- `LoopState.tokenBudgetUsed` is tracked in state (loop-state.ts:54)
- `LoopState.maxTokenBudget` is stored but never checked
- Both have TODO comments flagging them as placeholders

**Implementation:**

#### 4a. Change `GenerateFn` signature

```typescript
// Before (loop-controller.ts:83):
export type GenerateFn = (feedback?: string) => Promise<void>;

// After:
export interface GenerateResult {
  tokenUsage: number;  // tokens consumed by this LLM call
}

export type GenerateFn = (feedback?: string) => Promise<GenerateResult>;
```

This is the ONLY breaking change. `runLoop` callers must now return token usage
from their generate function. For callers that cannot measure tokens (e.g.,
pass-through to an external LLM), return `0` — the budget check only activates
when `maxTokenBudget > 0`.

#### 4b. Add `TOKEN_BUDGET_EXCEEDED` action to state machine

```typescript
// In loop-state.ts — add to LoopAction union:
| { readonly type: 'CODE_GENERATED'; readonly tokenUsage: number }

// Add new action:
| { readonly type: 'TOKEN_BUDGET_EXCEEDED' }

// Add to VALID_TRANSITIONS:
RUNNING: ['CODE_GENERATED', 'TOKEN_BUDGET_EXCEEDED', 'ABORT'],
```

#### 4c. Implement budget check in state machine

In `loopStateMachine`, `CHECKING` → `COMPILE_CHECK_COMPLETED`:

Before transitioning to FEEDBACK, check: `state.tokenBudgetUsed + action.tokenUsage > state.maxTokenBudget`. If budget is exceeded AND `maxTokenBudget > 0`, transition to `ESCALATED` with a special error note.

Also add a dedicated check in the `RUNNING` → `CODE_GENERATED` handler:
accumulate `tokenBudgetUsed` and check against `maxTokenBudget`. If exceeded, transition to `ESCALATED` immediately.

#### 4d. Wire into `runLoop`

In `runLoop` (loop-controller.ts:123), change:

```typescript
// Before:
await generateFn(feedbackText);

// After:
const genResult = await generateFn(feedbackText);
const budgetAction = loopStateMachine(state, {
  type: 'CODE_GENERATED',
  tokenUsage: genResult.tokenUsage,
});
// Check if budget was exceeded after this call
if (budgetAction.state.phase === 'ESCALATED') {
  // ... handle escalation
}
```

#### 4e. Add TokenTracker utility

```typescript
// src/core/context/token-tracker.ts
export interface TokenState {
  readonly totalUsed: number;
  readonly budget: number;
  readonly remaining: number;
  readonly exceeded: boolean;
}

export function trackTokens(used: number, budget: number): TokenState;
```

This is a pure function, tested independently of the loop controller.

---

### 5. Critical Test Design — 50-Iteration Simulation

**Test file:** `tests/loop/loop-50-iteration-simulation.test.ts`

**Structure:**

```
describe('50-iteration memory budget simulation', () => {
  it('context never exceeds 40KB across 50 iterations', async () => {
    // 1. Create a TokenTracker with budget = 40_000
    // 2. Create a HistoryCompactor simulator
    // 3. Run 50 loop iterations:
    //    a. Each iteration generates ~800 tokens (avg)
    //    b. After each GREEN phase, compact history
    //    c. Assert totalContextBytes ≤ 40_000 after each iteration
    // 4. Assert final context ≤ 40_000
  });

  it('history.jsonl never exceeds 40KB across 50 iterations', async () => {
    // 1. Simulate writing to history.jsonl after each iteration
    // 2. After compaction, history.jsonl should only contain summaries
    // 3. Assert history.jsonl size ≤ 40_000
  });

  it('loop controller terminates when token budget exceeded', async () => {
    // 1. Run runLoop with maxTokenBudget = 5000, maxIterations = 50
    // 2. Each generateFn returns tokenUsage = 1000
    // 3. Assert loop terminates at iteration 5 (budget exceeded before max iterations)
  });

  it('compaction hook reduces history to ≤4KB after TDD GREEN', () => {
    // 1. Build a TddHistory with 3 RED, 3 GREEN cycles (simulated ~30KB)
    // 2. Call compactTddHistory
    // 3. Assert result.bytesAfter ≤ 4_000
    // 4. Assert result.compactionRatio ≥ 7 (at least 7x reduction)
  });
});
```

**Test data:** Simulated, deterministic. No actual LLM calls. Each iteration
produces a fixed `tokenUsage` and generates a synthetic history entry of ~800
bytes.

**Run command:** `bun test tests/loop/loop-50-iteration-simulation.test.ts`

---

### 6. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| `GenerateFn` signature change breaks existing callers | Medium | High | The only caller is `runLoop` callers. Since this is an internal API, audit all call sites. Document the migration: return `{ tokenUsage: 0 }` for no-op. |
| Compaction hook clears useful context | Low | Medium | Only applied in `isolated` scope TDD cycles. The summary preserves acceptance criteria and test results — the minimum needed for REFACTOR. |
| Scope block is inaccurate → agent misses files | Medium | Medium | This is a pre-existing constraint (task-coach validates scope). ContextInjector's `truncated` flag surfaces budget issues to the orchestrator. |
| Token budget tracking depends on LLM returning accurate token counts | Low | Low | Tokens are estimated by the caller (the agent prompt wrapper). If the caller cannot measure, it returns 0 and budget enforcement is skipped. |
| 50-iteration simulation passes but real-world context grows faster | Low | Low | The simulation uses worst-case (no summarization). Real TDD cycles compact after each GREEN, so real-world context should be smaller. |

---

### 7. Acceptance Criteria Validation

| Criterion | How the plan satisfies it |
|-----------|--------------------------|
| 1. Orchestrator injects only files in Task Card Scope during SDD/TDD | `ContextInjector` filters workspace to only `Scope.files` when `context_scope` is `isolated` or `continuation`. Orchestrator prompt updated to pass scoped files. |
| 2. Compaction hook clears TDD history after tests pass, passes only summary | `cc-tdd-cycle/SKILL.md` updated: step 2d compacts RED/GREEN history before REFACTOR. `HistoryCompactor` utility provides programmatic verification. |
| 3. Inter-agent messages are concise, no orchestrator self-summary | `orchestrator.md` updated: removes Orchestrator Report block, adds hard rule against self-summaries. All agents: deliverable-only output. |
| 4. 50-iteration simulation: context ≤ 40KB, history.jsonl ≤ 40KB | `loop-50-iteration-simulation.test.ts` covers both assertions with deterministic test data and a maximum budget of 40,000 bytes. |

---

### 8. Implementation Order

The four modules are independent. Recommended order for maximum confidence:

1. **Token budget enforcement** (loop-state.ts + loop-controller.ts + token-tracker.ts) — touches existing code, catches runaway loops first
2. **50-iteration simulation** (test file) — validates the budget enforcement immediately
3. **Concise messages** (orchestrator.md prompt update) — zero-risk, no code
4. **Compaction hook** (cc-tdd-cycle/SKILL.md + history-compactor.ts) — workflow-level, low risk
5. **Micro-context injection** (context-injector.ts + context-types.ts) — last because it depends on Task Card Scope accuracy which is already validated

---

### 9. Open Questions

1. **How are token counts measured?** The `GenerateFn` now returns `tokenUsage`.
   For OpenCode (our current target), the LLM provider returns usage metadata.
   Do we have access to that data in the agent prompt wrapper? If not, we default
   to 0 and budget enforcement is a no-op. **Recommended: default to 0 until we
   can plumb token counts from the provider response.**

2. **Does `history.jsonl` currently exist?** The acceptance criterion references
   a `history.jsonl` file. I found no such file in the codebase. Is this a
   planned artifact (like the agent conversation log from OpenCode/Claude) or
   something we need to create? **If it does not exist, the simulation test can
   simulate writing to a synthetic history.jsonl.**

3. **Should ContextInjector actually READ files into memory?** The current
   design reads scoped files and includes their content in the context payload.
   At 40KB budget and typical file sizes (2-5KB), this means ~10 files max.
   If the scope has 20+ files, should we inject only file paths and let the
   agent read them on demand? **Recommended: inject file paths for `continuation`
   scope (agent has context to know what to read), inject content for `isolated`
   scope (agent starts blank).**
