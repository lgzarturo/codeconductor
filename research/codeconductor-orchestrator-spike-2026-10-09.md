# Spike: 12-Factor Orchestrator in Kotlin + Beads + OpenSpec + Headless Workers

For: Arturo L. Gómez · Date: Oct 9, 2026 · Duration: 10 business days (2 weeks)
Base: CodeConductor v1.6.1 (`147fa3c`), read-only inspection at `/workspace/codeconductor-src`, and previous report `research/codeconductor-improvements-2026-10-09.md` (findings S1-S16 and roadmap). No pushes, PRs, or issues created.

## Quick Verdict
- **Where it fits:** The orchestrator is a **separate runtime** (its own JVM process, `cc-runner`) that **consumes** CodeConductor artifacts (workflows, task cards, specs, scope-guard) via files and CLI. It is not a module within the TypeScript CLI. If the demo passes the go/no-go gate, it becomes **the execution engine foundation for 2.0**, while the TS CLI remains an installer and prompt generator (which it already does well).
- **Recommended executor for the spike:** **Codex CLI (`codex exec`)** as the primary worker: explicit `workspace-write` sandbox, JSONL events with token usage, and `--output-schema` to return structured reports. **Claude Code (`claude --bare -p`)** as the second interchangeable worker and independent reviewer. **Aider** serves as a cheap baseline, but not the long-term bet, as its last release was in August 2025. **OpenHands** only if container isolation via its REST Agent Server is required. All live behind a single `Executor` interface.
- **Realistic autonomy:** A chain of 5 **small, well-specified tasks** on a service with good test coverage is achievable without intervention across a subset of runs. "Guaranteeing zero hallucinations" is not possible. What is guaranteed is that **no hallucination advances to the next task** without passing deterministic gates, and the system stops and escalates rather than perseverating.

---

## 1. Fit with 1.6.1 and the 1.7/1.8/2.0 Roadmap

### What Exists in 1.6.1 That Serves as a Seed
| Existing Component | File | Use in Spike |
|---|---|---|
| Loop state machine (IDLE → RUNNING → CHECKING → FEEDBACK → DONE/FAILED/ESCALATED, `maxIterations` = 3) | `src/domain/loop/loop-state.ts:1-5,23,49,193` | Port the **design** to Kotlin (sealed classes); states and transitions are already mapped out |
| Loop engine with wall-clock and diff limits | `src/core/loop/loop-engine.ts:58,143,155,185` | Reference for per-task budget |
| Scope guard (out-of-bounds files) | `src/core/verification/scope-guard.ts` (79 lines) | "Bounded diff" gate; reimplemented in Kotlin using `git diff --name-only` |
| Test freezing by hash | `src/core/verification/test-freeze.ts` (`FreezeManifest`) | Anti-cheat gate: worker cannot touch acceptance tests |
| RDD evidence and receipts | `src/core/verification/verification-runner.ts`, `rdd-receipt.ts` | Per-task evidence format (reuses JSON schema) |
| Risk classifier | `src/core/ccep/risk-classifier.ts` (low/medium/high) | Decides if task requires reviewer or human approval |
| Escalation | `src/core/loop/escalation-emitter.ts` | Escalation report format |
| Task cards, handoff envelopes, and ledger | `src/core/ccep/task-card-validator.ts`, `handoff-envelope.ts`, `src/core/delivery/delivery-ledger.ts` | Worker input and output contract |
| YAML workflows | `src/core/ccep/workflows/{feature,fix,tdd-cycle,review}.yml` | Define phases executed by orchestrator |

**What is not reused:** `BACKLOG.md` + `openspec-state.json` as a queue, because Beads becomes the source of truth. Nor the custom reimplementation of OpenSpec (`src/core/openspec/*`, 16 files), since the official `openspec` CLI is used instead. This aligns with the 2.0 proposal from the previous report.

### Placement in Roadmap
| Version | Relation to Spike |
|---|---|
| 1.7 (security + detection-based init) | **Partial prerequisite**: S1-S5 must be resolved before letting workers run unsupervised (see §5). The spike runs on a demo repo, so it is not blocked |
| 1.8 (modules + lock) | Runner distributed as **opt-in module** `runtime.kotlin-runner` in manifest (`module.yml`, `risk: elevated`) |
| 2.0 (simplification ⚠️) | If go: CodeConductor execution engine becomes the JVM runner. `orchestrate`, `goal`, and `loop` in TS CLI (`src/commands/orchestrate.command.ts`, `src/core/orchestrator/runtime-orchestrator.ts`) become lightweight facades invoking it. ⚠️ Breaks backward compatibility for direct callers of `orchestrate` |

---

## 2. Kotlin Architecture

### 2.1 12-Factor Agents Principles Applied
Reference: `humanlayer/12-factor-agents` (26,625★, last push Sep 21, 2025, inspected Oct 9, 2026). Key factors applied here:
- **Own the control loop** (factor 8) and **own the context** (factor 3). The `while(true)` loop lives in Kotlin; no Python framework or worker CLI decides next steps.
- **Unify execution and business state** (factor 5): State lives in Beads and an event log, not in model context memory.
- **Launch, pause, and resume with simple APIs** (factor 6) and **treat humans as tools** (factor 7).
- **Small, focused agents** (factor 10): A worker receives a task and a spec, nothing more.
- **Stateless reducer** (factor 12): `next(state, event) → (state, commands)` is a pure, testable function.

### 2.2 Components
```
cc-runner (Kotlin, JVM 21, single process)
├── Loop            while(true): poll Beads → reducer → side effects → persist event
├── Reducer         pure function (TaskState, Event) -> (TaskState, List<Command>)
├── BeadsPort       wrapper around `bd` (--json): ready / show / update --claim / close / comment
├── SpecPort        wrapper around `openspec` (--json): show / validate / status
├── ExecutorPort    interface; impls: CodexExec, ClaudeBare, Aider, OpenHandsServer
├── LlmPort         direct API calls (planner, reviewer) via HTTP (Ktor/OkHttp)
├── Gates           build, tests, acceptance, scope, test-freeze, secrets, reviewer
├── Budget          tokens and USD per task, per chain, and per day
├── EventLog        append-only JSONL + hash chain (audit trail)
└── Workspace       git worktree per task, branch `cc/<bead-id>`
```
No agent frameworks: Kotlin + coroutines + kotlinx.serialization + Ktor client + ProcessBuilder. The main thread always belongs to the orchestrator.

### 2.3 Per-Task State Machine
```
READY ──claim──▶ CLAIMED ──prepare──▶ SPEC_LOADED ──dispatch──▶ EXECUTING
EXECUTING ──exit──▶ VERIFYING
VERIFYING ──all gates ok──▶ REVIEWING ──approve──▶ COMMITTED ──close bead──▶ DONE
VERIFYING ──gate fail & attempts<max & budget ok──▶ EXECUTING (with failure feedback)
VERIFYING ──gate fail & (attempts=max | budget exhausted)──▶ ESCALATED
REVIEWING ──reject──▶ EXECUTING (1 time) │ ESCALATED
any state ──kill switch | infra error──▶ PAUSED (resumable)
```
- `sealed interface TaskState` and `sealed interface Event`. Transitions are emitted by the reducer and persisted before side effects run (write-ahead).
- **Chain level:** The loop only pulls tasks returned by `bd ready` (no open blockers). If a task transitions to `ESCALATED`, its dependents never show in `ready`, pausing the chain naturally where expected.

### 2.4 Contracts
**Beads → Orchestrator.** Source is `bd ready --json` and `bd show <id> --json`. Atomic claims use `bd update <id> --claim` and closures use `bd close <id> "<reason>"` (commands from `gastownhall/beads` README, inspected Oct 9, 2026). Required bead fields (missing fields reject the task without running):
```yaml
id: bd-a1b2
title: "Add endpoint GET /orders/{id}/status"
spec_change: add-order-status          # folder openspec/changes/<id>
spec_requirements: ["REQ-ORDER-STATUS-1"]
allowed_paths: ["src/main/java/**/order/**", "src/test/java/**/order/**"]
acceptance_cmd: "./mvnw -q -Dtest=OrderStatusAcceptanceTest test"
risk: medium
max_attempts: 3
budget_usd: 1.50
```
**OpenSpec → Orchestrator.** Uses `openspec validate <change> --json` (must pass in strict mode) and `openspec show <change> --json` (official CLI, `docs/cli.md`, inspected Oct 9, 2026). Extracts requirements and scenarios from **Delta Specs** (`specs/**/spec.md` of the change, ADDED/MODIFIED/REMOVED sections) and `tasks.md`. Only the text of requirements cited by the bead is injected into the worker prompt.

**Orchestrator → Worker (Input).** A JSON `TaskEnvelope` (compatible with `handoff-envelope.ts`) containing the task, verbatim requirement text, `allowed_paths`, acceptance command, and previous attempt feedback. The worker does **not** receive the queue, other tasks, or secrets.

**Worker → Orchestrator (Output).** A `WorkerReport` validated with JSON Schema (`--output-schema` in Codex, `--json-schema` in Claude) with `files_changed`, `summary`, and `claims_tests_pass`. The orchestrator **does not trust it**: it is informative only. Truth is determined by the gates.

### 2.5 Idempotency
- **Idempotency key per attempt:** `sha256(bead_id + spec_hash + attempt)`. If EventLog already contains `COMMITTED` for this key, it is skipped.
- **Atomic claim** via `bd update --claim`; skips if claimed by another process.
- **One worktree per task** (`git worktree add .cc/wt/<bead> -b cc/<bead>` from recorded base commit). Retries always reset to this base commit (`git reset` inside disposable worktree, never on main branch).
- **Commit trailers** (`Bead-Id:`, `Spec-Change:`, `Attempt:`, `Run-Id:`). On resumption, `git log --grep` reconciles: if commit exists but bead is unclosed, bead is closed without rerunning.
- **Crash recovery:** Reads EventLog, reconstructs state with reducer, and resumes from last persisted event.

### 2.6 Retries
- **Infrastructure failures** (HTTP 429/5xx, process timeouts): Exponential backoff with jitter, up to 3 times, without burning task attempts.
- **Quality failures** (red gate): Up to `max_attempts` (default 3, matching `loop-state.ts:49`). Each retry receives **only** truncated gate error output.
- **Loop detection:** If two consecutive attempts produce the exact same diff (hash) or error, escalates immediately.

### 2.7 Token Budget and Cost
- **Measured, not estimated:** Codex `--json` emits `turn.completed.usage` (input, cached, output, and reasoning tokens), and Claude `--output-format json` returns `total_cost_usd` (documented client estimate). Sources: developers.openai.com/codex/noninteractive and code.claude.com/docs/en/headless, inspected Oct 9, 2026.
- **Hard caps:** Per task (`budget_usd` from bead; `--max-budget-usd` in Claude and `--max-model-steps` in Muse), per chain, and per day. Warning at 80%, stop at 100%.
- **External pricing table** (`pricing.yml` versioned). Avoid hardcoded figures: copy current provider pricing on demo day and record the date.

### 2.8 Auditable Logs
- Append-only `events.jsonl`, with `prev_hash` on each event (hash-chained audit log preventing tampering).
- Per attempt recorded: prompt sent (hash + file), worker JSONL events, diff, output of each gate (exit code, duration, last N lines), tokens, and cost.
- Query commands: `cc-runner report <run-id>` (summary per task) and `cc-runner replay <bead>` (reconstructs state).
- Logs **pass through secret scanner** before disk write; reuses patterns from `src/core/filesystem/safety.ts`.

---

## 3. Anti-Hallucination: Deterministic Verification Between Tasks

### 3.1 Ordered Gates (All Deterministic Except #7)
1. **Pre-flight:** Bead contract complete, `openspec validate` passes, working tree clean. If any check fails, zero tokens spent.
2. **Acceptance test first (RED):** Before worker runs, orchestrator (or preceding "test" task) verifies acceptance test **fails**. Hash frozen (`test-freeze.ts` pattern).
3. **Bounded diff:** All changed files ∈ `allowed_paths`, no frozen files touched, diff size ≤ N lines (configurable, e.g., 300).
4. **Build/compile:** `./mvnw -q compile` or `./gradlew compileKotlin`.
5. **Acceptance test (GREEN)** and **full regression suite**: Both must pass.
6. **Hygiene:** Secret scan on diff, lint and formatting (if configured in repo), and zero new dependencies without explicit permission in bead.
7. **Independent reviewer** (different model or provider than worker, called via API from Kotlin), output structured with JSON Schema: `{verdict, requirement_coverage[], concerns[]}`. Can only **block**, never approve alone: passes only if gates 1-6 AND reviewer approve.
8. **Commit** on task branch and bead close **only** after 1-7 pass. Merge to `main` remains human (or automated only for `risk: low` in later phases).

### 3.2 Why This Curtails Hallucinations
- The model **does not decide** if it finished: exit codes decide. Muse documents this explicitly: `muse exec` exit code "reflects how the run ended, not whether the work is correct", advising to "gate on your own test command" (dev.meta.ai/docs/muse-code/extending, inspected Oct 9, 2026).
- The next task starts from the **verified commit** of the previous task, not model memory of what it thought it did.
- Requirements arrive **quoted verbatim** from OpenSpec. The reviewer validates requirement-by-requirement coverage.

### 3.3 Stop Conditions and Human Escalation
| Trigger | Action |
|---|---|
| `max_attempts` exhausted | `ESCALATED` + comment on bead with evidence; chain halts on dependents |
| Identical diff or error twice | Escalate without exhausting remaining attempts |
| Task, chain, or daily budget reached | `PAUSED` |
| Worker touched frozen tests or out-of-scope paths | Immediate reject; escalate after 2 failures |
| `risk: high` (migrations, auth, data) | Always human approval before commit |
| Ambiguous spec (reviewer flags "unverifiable requirement") | Escalate to spec author; do not retry |
| Kill switch (`.cc/STOP` file or signal) | Abort active attempt and pause |

### 3.4 Honesty on Autonomy
- Realistic target for a 2-week spike is **supervised autonomy**: Human authors/approves spec and beads, system runs chain, human reviews and merges.
- Success rate depends primarily on **acceptance test quality and task size**, not worker cleverness. In legacy Java with poor coverage, Gate 5 will miss regressions. The plan includes measuring baseline coverage and choosing a well-tested service.
- No arbitrary claims: the demo **measures** the rate. Go/no-go criteria in §6 define a priori thresholds to keep evaluations objective.

---

## 4. Headless Executor Comparison (Verified Oct 9, 2026)

Data from GitHub (`api.github.com/repos/...`, inspected Oct 9, 2026 ~17:00 UTC-5) and official documentation.

| Criterion | Aider | OpenHands | Codex CLI | Claude Code | Muse Code |
|---|---|---|---|---|---|
| Repo / License | Aider-AI/aider · Apache-2.0 · 49,435★ | OpenHands/OpenHands · MIT · 90,399★; SDK `OpenHands/software-agent-sdk` 1,225★ | openai/codex · Apache-2.0 · 128,386★ | anthropics/claude-code · unstated API license · 149,860★ | Proprietary (Meta); docs at dev.meta.ai |
| Latest Release | **v0.86.0, Aug 9, 2025**; last push May 22, 2026 | v1.26.0, Oct 8, 2026; SDK v1.54.0, Oct 9, 2026 | rust-v0.162.1, Oct 9, 2026 | v2.1.296, Oct 9, 2026 | Not checked (no equivalent public repo) |
| Headless | `aider --message`/`--message-file`, `--yes`, `--auto-commits` (docs "Scripting aider") | `openhands --headless -t "…"`; page marked under "Deprecated Projects" in docs (updated Jan 26, 2026). Current path is **REST Agent Server** in SDK | `codex exec`, `--json` (JSONL), `--output-schema`, `-o`, `--ephemeral`, `resume` | `claude -p`, `--bare`, `--output-format json/stream-json`, `--json-schema`, `--allowedTools`, `--permission-mode dontAsk`, `--max-budget-usd` | `muse exec`, `--json`, `--prompt-file`, `--max-model-steps` |
| Sandbox | No built-in sandbox: executes on host; isolate with external container | Execution in Agent Server workspace; headless CLI "always runs in always-approve mode" with no toggle | Defaults to **read-only**; `--sandbox workspace-write`; `danger-full-access` only in isolated env; requires git repo | No OS sandbox in `-p` documented on that page; permission rule control; `--bare` avoids loading hooks, MCP, and repo CLAUDE.md | Active sandbox with `--disable-approval`; `--yolo` disables sandbox and **trusts checkout AGENTS.md/skills** |
| Measurable Cost | Shows tokens and cost in session; JSON output unverified | Depends on configured LLM; report unverified | `usage` in `turn.completed` | `total_cost_usd` (client estimate) | Cost field unverified |
| "Blind Worker" Fit | **High concept**: Edits provided files, does not explore or execute unless instructed | Medium: Full autonomous agent, larger surface area | High: Default sandbox and structured output | High with `--bare` + minimal allowlist | High, but restricted to Meta provider |
| Activity / Maintenance | **Risk**: 14 months without release | Highly active, in V0 → V1/SDK transition | Highly active | Highly active | Recent (Developer Preview in SDK components as of Oct 8 report) |

**Recommendations:**
1. **Codex `exec` as default worker**: Default read-only sandbox, explicit `workspace-write` mode, JSONL token usage, and structured output schema. Spike configuration: `codex exec --sandbox workspace-write --json --output-schema worker-report.json --ephemeral --ignore-user-config -`, with `CODEX_API_KEY` injected solely into that process (recommended by official docs).
2. **Claude Code as second worker and reviewer** (reviewer always on different provider than worker): `claude --bare -p --permission-mode dontAsk --allowedTools "Read,Edit,Bash(./mvnw -q test *)" --output-format json --json-schema … --max-budget-usd <cap>`.
3. **Aider as cost control benchmark**: 1-2 runs only; fits blind worker concept, but lack of releases since August 2025 poses maintenance risk.
4. **OpenHands** only if managed container isolation is required: Integrate via REST Agent Server (Kotlin handles HTTP, Python does not control main thread). Avoid deprecated headless CLI.
5. **Muse** as alternative to Codex if user prefers Meta stack. Never run `--yolo` outside disposable containers.

---

## 5. Security (Linked to S1-S5)

| Risk in Spike | Relation | Control |
|---|---|---|
| Worker with broad permissions executes malicious repo instructions (injection) | **S1/S2** (`npx *`, `python *`, `WebFetch(*)`, `Read(**)` in `presets/claude/settings.json:39-63`) | Runner **does not use** CodeConductor presets for workers: Codex runs `--ignore-user-config` with sandbox, Claude runs `--bare` with minimal allowlist (build/test command only). No web fetch. Container network closed except for LLM endpoint |
| Repo configuration auto-loads (hooks, MCP, AGENTS.md) | **S3** (overwrite of `settings.json` + unpinned third-party plugin) | `--bare` in Claude (does not read `.claude/settings.json` or `.mcp.json`); never `--yolo` in Muse; clean worktree without `.claude/`; review demo repo `AGENTS.md` |
| Guard fails open | **S4** (`presets/shared/invoke-hook.cjs:86-95`) | Gates live in Kotlin runner and fail **closed**: any gate failure = reject |
| Repo code executes as tool | **S5** (`invoke-hook.cjs:103-116`) | Runner invokes binaries by **absolute path and pinned version** (verified checksum of installed `bd`, `openspec`, `codex`, and `claude`) |
| Secrets | — | API keys injected strictly in worker/LLM process environment (never in build/test which runs repo code; explicit recommendation from Codex docs). No access to `~/.ssh`, `~/.aws`, or `.env` (container mounts). Diff and log scanning |
| Execution isolation | — | Disposable container per task (Docker/Podman), non-root user, read-only filesystem except worktree, no `docker.sock`, limited CPU/memory/time |
| Exfiltration | — | Egress allowlist: Only provider API endpoints and Maven registry (or preheated local cache) |
| Push and merge | — | Runner **lacks push credentials**. `cc/<bead>` branches remain local; human reviews and merges |

---

## 6. Day-by-Day Plan (10 Business Days) and Demo

**Demo repo:** Legacy Java/Spring microservice with runnable test suite. Off-the-shelf option: Local fork of `spring-projects/spring-petclinic` (Java/Spring, existing tests). Verify suite passes green on Day 1. If Arturo has an in-house service with more debt, use that instead.

| Day | Deliverable | Verification |
|---|---|---|
| 1 | Kotlin skeleton (Gradle, JVM 21): Pure reducer + sealed states + hash-chained EventLog. Cloned demo repo, measured green suite (baseline time and coverage) | Reducer unit tests (all transitions in §2.3) |
| 2 | Direct HTTP `LlmPort` + `Budget` + `pricing.yml`; `while(true)` loop with kill switch and EventLog resumption | Test: Kill process mid-execution and resume without duplicate effects |
| 3 | `ExecutorPort` + `CodexExec` (JSONL, schema, sandbox) in per-task worktree; execution container | Toy task finishes with commit and recorded tokens |
| 4 | `BeadsPort` (`bd ready/show/update --claim/close`, `--json`); validated bead contract | 3-bead dependency chain traversed in order |
| 5 | Gates 1-6 (pre-flight, RED with freeze, scope, build, tests, secrets) failing closed | Simulated "adversarial" worker tests: touches test, exits scope, fails build → all 3 rejected |
| 6 | OpenSpec: `openspec init` in demo; `/opsx:propose` moderate change (e.g., "appointment status history with query endpoint and validation"); human-reviewed Delta Specs saved | `openspec validate --json` passes green; reviewed spec |
| 7 | `SpecPort`: Extract requirements from Delta Specs into `TaskEnvelope`; 5 dependent beads created from `tasks.md` | `bd ready` displays only the first task |
| 8 | Independent reviewer (separate provider, JSON Schema) + `ClaudeBare` as second worker; stop and escalation rules | Escalation test: Impossible task → `ESCALATED` in ≤3 attempts |
| 9 | **Benchmark:** 5-task chain × 3 runs with Codex, × 3 runs with Claude, × 1 run with Aider (control) | `cc-runner report` |
| 10 | Go/no-go report, recorded demo, 2.0 decision | — |

**Demo Metrics**
- Success rate per task (closed without intervention) and **per complete chain** (all 5).
- Mean attempts per task and rejection reason per gate.
- Cost per task and per chain (USD measured from events) and in/out tokens.
- Wall-clock time per task.
- **Escapes**: Defects found in final human review that gates missed (primary metric for uncaught hallucinations).
- False stops: Escalations judged unnecessary by human review.

**Go / No-Go Criteria** (Defined in advance)
- **GO to 2.0** if all of the following are met:
  - ≥ 4/5 tasks closed without intervention in at least 2 of 3 runs with primary worker.
  - **0 high-severity escapes** (regressions or unmet requirements marked done).
  - 100% simulated adversarial attempts rejected.
  - Crash recovery without duplicate commits.
  - Per-task cost within caps defined on Day 2.
- **Partial GO** (keep as opt-in module in 1.8, not core of 2.0): 3/5 tasks, 0 high escapes, control and security intact.
- **NO-GO**: Any high-severity escape, any failed security rejection, or < 3/5 tasks. Keep useful parts (gates and EventLog) and re-evaluate with smaller tasks or stronger tests before testing another worker.

---

## Sources (Inspected Oct 9, 2026)
- GitHub API: Aider-AI/aider, OpenHands/OpenHands, OpenHands/software-agent-sdk, openai/codex, anthropics/claude-code, humanlayer/12-factor-agents, gastownhall/beads, Fission-AI/OpenSpec.
- Aider, "Scripting aider": `raw.githubusercontent.com/Aider-AI/aider/main/aider/website/docs/scripting.md`.
- OpenHands headless: https://docs.openhands.dev/openhands/usage/cli/headless (under "Deprecated Projects", updated Jan 26, 2026); OpenHands README (Agent Server / SDK).
- Codex: https://developers.openai.com/codex/noninteractive.
- Claude Code: https://code.claude.com/docs/en/headless.
- Muse Code: https://dev.meta.ai/docs/muse-code/extending (#headless), https://dev.meta.ai/docs/muse-code/configuration, https://ai.developer.meta.com/docs/muse-code/permissions.md.
- Beads: `gastownhall/beads` README. OpenSpec: `Fission-AI/OpenSpec` README and `docs/cli.md`.
- CodeConductor v1.6.1 @ `147fa3c` and `research/codeconductor-improvements-2026-10-09.md`.

**Unverified:** Did not execute any workers or `bd`/`openspec` CLIs. Did not verify token pricing, cost output of Aider/OpenHands/Muse, or OpenHands Agent Server sandbox. Spring Petclinic is a suggestion; verify suite passes on Day 1.
