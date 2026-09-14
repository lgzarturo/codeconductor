# USAGE — Slash Commands, Workflows, Agents, and Skills

Operational reference for using CodeConductor slash commands correctly inside
agent workflows: what each command does, which agents run in each workflow,
how the CLI guarantees determinism (and how to replicate it during
development), and how stack skills bind to agents.

Deeper references: [`docs/cc-commands.md`](docs/cc-commands.md) (CLI),
[`docs/CCEP.md`](docs/CCEP.md) (protocol), [`docs/SDD.md`](docs/SDD.md)
(spec-driven delivery), [`docs/routing-policy.md`](docs/routing-policy.md)
(routing), [`docs/usage-cc.md`](docs/usage-cc.md) (end-user quickstart).

---

## 1. Golden rules

1. **One slash command per request.** Commands are workflows, not chat
   prompts. `/cc-ask` is the only command that merely *recommends* another
   command without executing it.
2. **Command names are fixed, never inferred.** Every workflow file pins its
   CCEP command (`Command: 'feature' — fixed for this workflow — do not
   infer from user text`). Agents must parse `$ARGUMENTS` against that fixed
   command, never guess a different one from the user's wording.
3. **Step 0 (CCEP bootstrap) is mandatory** for every CCEP workflow before
   delegating to any agent. Skipping it is a defect, not an optimization.
4. **Delegate compiled prompts, not raw text.** Subagents receive compiled
   CCEP prompts; raw `$ARGUMENTS` is never forwarded to planners.
5. **STOP gates are blocking.** When a workflow says **STOP** or
   `ccep evaluate` returns `stop: true`, halt and wait for human input.
   Never reason past a gate.
6. **OpenSpec state is CLI-driven.** Status transitions go through
   `openspec start|done|block|archive` — never hand-edit
   `openspec-state.json` or files under `.codeconductor/evidence/`.
7. **Local development uses `bun run dev`**, never `npx cc-codeconductor`
   (that runs the published package, not your working tree).

### Runner spellings

All commands ship per runner from one source
(`src/core/presets/workflow-commands.ts`). Installed layouts:

| Runner              | Install location                    | Invocation                          |
| ------------------- | ----------------------------------- | ----------------------------------- |
| Claude Code         | `.claude/commands/cc/<name>.md`     | `/cc:<name>` (alias `/cc-<name>`)   |
| Cursor              | `.cursor/commands/cc/<name>.md`     | `/cc:<name>` (alias `/cc-<name>`)   |
| Gemini CLI          | `.gemini/commands/cc/<name>.toml`   | `/cc:<name>`                        |
| OpenCode            | `.opencode/commands/cc-<name>.md`   | `/cc-<name>`                        |
| Codex               | `.codex/skills/cc-*/SKILL.md`       | via `AGENTS.md` routing             |
| Antigravity (agy)   | `.agents/workflows/cc-<name>.md`    | `/cc-<name>`                        |

Utility commands outside the CCEP set: `/commit` (Conventional Commits from
staged diff) and `/graphify` (knowledge-graph pipeline).

---

## 2. Execution model

Every CCEP slash command follows the same skeleton.

### Step 0 — CCEP bootstrap (mandatory)

```bash
npx cc-codeconductor ccep parse    --command <name> "$ARGUMENTS" --output json
npx cc-codeconductor ccep resolve  --command <name> "$ARGUMENTS" --output json
npx cc-codeconductor ccep profile  <name> --output json
npx cc-codeconductor ccep evaluate --command <name> --input <planner.json> --output json
```

- `parse` — validates `$ARGUMENTS` against the command's Zod intake schema.
- `resolve` — builds the execution context (repo, constraints, risk
  threshold).
- `profile` — returns the declarative workflow profile: phases, agents,
  `dependsOn`, `requires`, `stopGate`, `riskRules`, confirmation gate.
- `evaluate` — runs the **ConfirmationGate** over the planner output. If
  `stop: true`, show questions/risks and wait for a human (reasons:
  `clarification`, `confirmation`, `high_risk`, `risk_threshold`).

### Step 0b — OpenSpec quality gates (SDD delivery commands)

Applies to: `feature`, `fix`, `tdd-cycle`, `api-contract`, `db-migration`,
`iterative`, `spec-mutation`, `openspec` (the `SDD_DELIVERY_COMMANDS` set).
If `openspec status` reports an active change folder:

```bash
npx cc-codeconductor openspec validate --output json
npx cc-codeconductor openspec analyze  --output json
```

If analyze `stop` is true or any finding is CRITICAL, stop — do not
delegate to `implementer`.

### Phases → agents → STOP gates

The profile routes phases in dependency order (a phase runs only when its
`dependsOn` phases are done). STOP gates appear at:

- **Intake/confirmation** — unresolved `questionsForUser` halt the flow.
- **Approval** — Technical Plans require explicit human approval before
  implementation (`design`/`bounds` phases with `stopGate: approval`).
- **Risk** — high-severity risks halt under `stopOnHighRisk`.

### Completion

Each workflow ends with a Completion section naming its artifacts (Task
Card, Technical Plan, Test Report, Implementation Summary, Review Report,
Council Verdict) and, where relevant, the next command to run.

---

## 3. Slash command catalog

Source of truth: `src/core/presets/workflow-commands.ts` (names/schemas) and
`src/core/ccep/profiles.ts` (`WORKFLOW_PROFILES`).

| Command          | Purpose                                        | Key STOP gates                    |
| ---------------- | ---------------------------------------------- | --------------------------------- |
| `cc-feature`     | Full feature lifecycle                         | intake, plan approval             |
| `cc-fix`         | Bug fix with risk-based routing                | intake                            |
| `cc-refactor`    | Refactor with complexity audit                 | —                                 |
| `cc-review`      | Diff/code review (no gates)                    | —                                 |
| `cc-test-plan`   | Structured test plan for a scope               | —                                 |
| `cc-tdd-cycle`   | Red → Green → Refactor under the three laws    | none (evidence-gated)             |
| `cc-spec-mutation` | Gherkin-frozen spec + TDD + judge + mutation | spec approval, mutation 100% kill |
| `cc-api-contract`| Define/validate API contracts                  | SDD gates                         |
| `cc-db-migration`| Schema migration coordination                  | SDD gates                         |
| `cc-pagespeed`   | Core Web Vitals / PSI audit                    | none                              |
| `cc-openspec`    | Deliver `BACKLOG.md` items via OpenSpec loop   | validate, analyze, review gate    |
| `cc-backlog`     | Author/append `BACKLOG.md` + change folders    | grilling, validate                |
| `cc-scorecard`   | Score deliverable quality                      | none                              |
| `cc-council`     | Council-driven SDD + TDD loop                  | deliberation, council verdict     |
| `cc-iterative`   | Full iterative pipeline incl. council + docs   | grilling, plan approval, council  |
| `cc-explore`     | Map repo, recommend next command (read-only)   | none                              |
| `cc-triage`      | Classify type/risk, pick destination workflow  | confirmation                      |
| `cc-prototype`   | Disposable spike in isolated worktree          | spike bounds approval             |
| `cc-handoff`     | Compact session into gitignored handoff file   | secret redaction                  |
| `cc-clarify`     | Re-explain last deliverable in Task Card terms | open questions                    |
| `cc-security`    | Authorized defensive security workflow         | authorization, plan approval      |
| `cc-ask`         | Recommend one `/cc:` command from natural text | none (never executes)             |
| `cc-pipeline`    | 8-phase multi-agent loop (see below)           | SDD spec gate, verdict/merge gate |

### Delivery workflows

**`/cc-feature`** — Canonical new-feature route. Phases:
`repo-explorer` (wayfinding) → `task-coach` (intake, STOP) → `architect`
(design, STOP for approval) → `tester` (tests first) → `implementer`
(worktree, minimal diff) → `reviewer` ∥ `docs` (parallel). Use for any new
behavior. Test-before-implement is the canonical delivery order.

**`/cc-fix`** — Bug fix. Risk-based routing: `low` →
wayfinding → test → implement; `medium`/`high` → add `reviewer`. Fix
intake requires actual vs expected behavior and reproduction steps.

**`/cc-refactor`** — `task-coach` → `architect` → `implementer` →
`complexity-auditor` (LOC/complexity/bloat report) → `reviewer`. Never
refactor without a baseline test suite.

**`/cc-review`** and **`/cc-test-plan`** — Single-purpose: `reviewer`
produces a Review Report (CRITICAL/WARNING/SUGGESTION); `tester` produces a
test plan. No confirmation gates; safe to run repeatedly.

**`/cc-tdd-cycle`** — Mechanically enforced Red→Green→Refactor. Phases carry
`requires: red-state | green-state | refactor-state`; evidence is captured
by the verification runner into `.codeconductor/evidence/`, never
hand-written. Invoke skill `testing-tdd`.

**`/cc-spec-mutation`** — The strictest delivery path:

1. `task-coach` refines intent (Socratic grilling, STOP).
2. `contract-builder` authors the Gherkin `.feature`; spec + tests are
   frozen by SHA-256 into `.codeconductor/tasks/<task_id>.lock`.
3. `tester` (RED) → `implementer` (GREEN) under the three laws; any write
   to `specs/` or `tests/` after freeze is a harness violation.
4. `reviewer` as judge: compile clean, step traceability, scope audit
   (`git diff --name-only` must match Task Card scope). Binary PASS/REJECT.
5. Mutation gate: `python3 presets/shared/mutation_runner.py --target <file>
   --test-command "<cmd>" --spec-folder specs` — deterministic AST
   mutations, unconditional rollback, exit code **2** on any surviving
   mutant. Survivors route back to the tester with `specs/handover.md`;
   circuit breaker after 3 loops (rollback + escalate to human).

### OpenSpec loop

**`/cc-backlog`** — Authoring only (never implementation): `repo-explorer`
wayfinding → `task-coach` relentless grilling (STOP, one question at a
time) → `docs` writes/appends `BACKLOG.md` (next `BC-NNN`, status `READY`)
→ `openspec validate` (mandatory gate) → `openspec plan <BC-id>` per item.
Applies skill `backlog`. Ends by telling the user to run `/cc-openspec`.

**`/cc-openspec`** — Delivery loop: `openspec validate` (STOP if invalid) →
`openspec scan` → select READY item → `openspec plan <BC-id>` → execute
loop with `openspec next` mapping phases to agents (discover→`repo-explorer`,
design→`architect`, test→`tester`, implement→`implementer` in worktree,
review→`reviewer`) → review gate (reject → STOP) → `openspec archive
<itemId>`. State changes only via CLI. Applies skill `openspec`.

**`/cc-scorecard`** — `openspec analyze` (if change folder exists) →
`scorecard create --task <id> --from-diff` → complete criteria per
`docs/agent-scorecard.md` → `scorecard record` / `scorecard aggregate`.
Applies skill `evaluation`.

### Meta workflows

**`/cc-iterative`** — The advanced route: wayfinding (with `graphify query`
when a graph exists) → relentless grilling (STOP) → `contract-builder` +
`architect` (STOP for plan approval) → `tester` → `implementer` (worktree,
max 3 repair cycles) → `council` skill on the diff (`securityVeto` can
override majority) → `docs` + `graphify update .`.

**`/cc-council`** — Council-Driven Development: `council` skill as steering
committee (`task-coach` + `architect` + `devil`) drafts Task Card &
Technical Plan (STOP) → `tester` writes failing tests → `implementer`
surgical loop until green → `council` skill reviews the diff on 6 axes
(Architecture, Security, Product, Delivery, DataOps, Devil); any CRITICAL
vote → BLOCKED, return to implementation.

**`/cc-pipeline`** — 8-phase loop: Intake (`task-coach`) → Structure
(`prompt-structurer`: XML-tagged params, AST signatures instead of full
files) → Design (`architect`, SDD SPECIFICATION GATE) → Test
(`adversarial-tester` RED) → Implement (max 3 implement-test iterations) →
Validate (mutation testing ≥80% kill + diff scope audit) → Council verdict
(6 axes, veto + confidence escalation <0.6/<0.7, VERDICT/MERGE GATE) →
Compact (`compaction-hook`, `.codeconductor/memory.md` ≤40KB).

**`/cc-security`** — Defensive-only, authorization-gated. Refuses exploit
development, malware, red-team, or unauthorized procedures. Requires an
authorization statement in `$ARGUMENTS`; without it, STOP and refuse. Loads
the matching `security-*` domain skill. Risk routes: `low` → task-coach →
tester → implementer; `medium`/`high` → + `architect` (STOP for plan
approval) and `reviewer` applying the OWASP `security` skill.

**`/cc-explore`, `/cc-triage`, `/cc-prototype`, `/cc-handoff`,
`/cc-clarify`, `/cc-ask`** — Read-only mapping + next-command suggestion;
risk classification into a destination command; disposable worktree spike
(bounds STOP); session compaction into gitignored
`.codeconductor/sessions/handoff.md` with secret redaction; plain-language
restatement of the last deliverable; and free-text command recommendation
(`cc-ask` never executes the recommendation).

---

## 4. Agent support matrix

Derived from `WORKFLOW_PROFILES` (`src/core/ccep/profiles.ts`). Each row is
the ordered phase → agent route a command executes. `→` is sequence;
`∥` is parallel; `(gate)` marks a STOP/approval gate; `(cli-gate)` is an
orchestrator-run CLI step; the `council` entry is a **skill**, not an agent.

| Command           | Ordered route (phase → agent)                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `feature`         | repo-explorer → task-coach(gate) → architect(approval) → tester → implementer → reviewer ∥ docs                          |
| `fix`             | repo-explorer → task-coach(gate) → tester → implementer [→ reviewer on medium/high]                                        |
| `refactor`        | task-coach → architect → implementer → complexity-auditor → reviewer                                                       |
| `review`          | reviewer(diff-collection) → reviewer(report)                                                                                |
| `test-plan`       | task-coach → tester(plan)                                                                                                   |
| `tdd-cycle`       | tester(red-state) → implementer(green-state) → implementer(refactor-state)                                                  |
| `spec-mutation`   | task-coach(gate) → contract-builder(approval) → tester(red) → implementer(green) → reviewer(judge) → tester(mutation) → reviewer |
| `api-contract`    | contract-builder → architect                                                                                                 |
| `db-migration`    | architect → tester → implementer → reviewer                                                                                  |
| `pagespeed`       | repo-explorer(psi-fetch) → docs(report)                                                                                      |
| `openspec`        | orchestrator(validate) → repo-explorer → architect → orchestrator(analyze) → tester → implementer → reviewer                 |
| `backlog`         | repo-explorer → task-coach(gate) → docs → orchestrator(validate) → orchestrator(plan)                                        |
| `scorecard`       | orchestrator(analyze) → orchestrator(create) → reviewer(evaluate)                                                            |
| `council`         | repo-explorer → council skill[task-coach + architect + devil](gate) → tester(red) → implementer → council skill(verdict)    |
| `iterative`       | repo-explorer → task-coach(gate) → contract-builder → architect(approval) → tester → implementer → council skill → docs      |
| `explore`         | repo-explorer(map) → orchestrator(suggest-next)                                                                               |
| `triage`          | task-coach(classify, gate)                                                                                                    |
| `prototype`       | architect(bounds, approval) → implementer(spike)                                                                                |
| `handoff`         | docs(compact)                                                                                                                  |
| `clarify`         | task-coach(re-explain)                                                                                                          |
| `security`        | repo-explorer → task-coach(gate) → architect(approval, med/high) → tester → implementer → reviewer(med/high)                  |
| `pipeline`        | task-coach → prompt-structurer → architect(gate) → adversarial-tester → implementer → tester → council skill → compaction-hook |

**Agents at a glance** (full contracts in `.agents/AGENTS.md`):

- `orchestrator` — validates Task Cards, classifies risk, routes, enforces
  gates. Runs `cli-gate` phases; never writes code.
- `task-coach` — intake/grilling; turns vague requests into valid Task
  Cards. Read-only.
- `repo-explorer` — maps repo, conventions, impact radius; runs `graphify
  query` when a graph exists. Read-only.
- `architect` — Technical Plans, ADRs, API contracts; `stopGate: approval`.
- `contract-builder` — OpenAPI/JSON-Schema/TS-interface contracts before
  implementation.
- `tester` — RED tests and test plans; evidence-gated in TDD phases.
- `implementer` — minimal diff in a Git worktree; never invents design.
- `reviewer` — Review Reports (CRITICAL/WARNING/SUGGESTION), judge verdicts.
- `security-reviewer` — provider-agnostic security analysis; `securityVeto`
  overrides majority consensus.
- `complexity-auditor` — LOC/complexity/bloat report before reviewer.
- `docs` — README/OpenAPI/ADR/changelog; session compaction.
- `goal-planner` — objective → YAML task graph (deterministic templates).
- Pipeline-only: `prompt-structurer`, `adversarial-tester`,
  `compaction-hook`.

---

## 5. Determinism: what the code guarantees and how to replicate it

Slash commands look like free-text prompts, but the runtime behind them is
deterministic. Every guarantee below is enforced in code, not in the prompt,
so the same inputs produce the same routing, gates, and stop conditions.

### 5.1 Mechanisms (source of truth)

| Mechanism | Source | Guarantee |
| --------- | ------ | --------- |
| Fixed command names | `WORKFLOW_COMMANDS` (`src/core/presets/workflow-commands.ts`) | `$ARGUMENTS` are parsed against a Zod intake schema; the command is never inferred from prose |
| Declarative profiles | `WORKFLOW_PROFILES` (`src/core/ccep/profiles.ts`) | Phases, `dependsOn`, `requires`, `stopGate`, `riskRules`, and confirmation gate are data, not model judgment |
| ConfirmationGate | `evaluateConfirmationGate` (`src/core/ccep/confirmation-gate.ts`) | Stops for `clarification` (open questions), `confirmation`, `high_risk`, or `risk_threshold` |
| Risk classifier | `classifyRisk` (`src/core/ccep/risk-classifier.ts`) | Migration/API-contract/auth/payment/secret signals are always `high`; `docs`/`review`/`test` are `low` |
| TDD state machine | `requires: red/green/refactor-state` + verification runner (`src/core/verification/verification-runner.ts`) | A phase cannot advance until runner-captured evidence exists in `.codeconductor/evidence/`; evidence is never hand-written |
| Mutation gate | `presets/shared/mutation_runner.py` | Deterministic AST operators, SHA-256 frozen spec/tests, unconditional rollback, exit code `2` on a surviving mutant, 3-loop circuit breaker |
| Goal graph | `goal-planner` (`src/core/goal/goal-planner.ts`) | Keyword templates (auth, crud, search, notification, migration) with a generic fallback; delegation strictly in `depends_on` order |
| OpenSpec state | `openspec` CLI (`src/commands/openspec.command.ts`) | `validate/scan/plan/analyze/status/next/start/done/block/archive` are the only writers of `openspec-state.json` |
| Worktree isolation | implementer contract | All edits happen in a Git worktree; protected branches (`main`, `master`, `develop`) are never touched |

### 5.2 Replicating determinism during development

Use `bun run dev` (never `npx`) to reproduce exactly what a slash command
will do, inspect the JSON at each step, and fail fast before delegating:

```bash
# 1. Validate intake + see the envelope
bun run dev ccep parse    --command feature "<request>" --output json

# 2. Build the execution context (repo, constraints, riskThreshold)
bun run dev ccep resolve  --command feature "<request>" --output json

# 3. Inspect the declarative profile (phases/gates/riskRules)
bun run dev ccep profile  feature --output json

# 4. Compile the exact prompt that a phase/agent will receive
bun run dev ccep compile  --command feature --phase test --output json

# 5. Run the gate over a planner output file
bun run dev ccep evaluate --command feature --input planner.json --output json
```

If `evaluate` returns `stop: true`, treat it as a hard stop locally too —
answer the questions or approve the plan before rerunning.

Additional verification loops:

- `bun run dev doctor` — checks install health, agent markers/sizes, and
  complementary-tool detection.
- `bun run dev ccep validate` / `taskcard` / `consensus` — validate an
  envelope, a Task Card, or a council verdict offline.
- `bun test` — exercises the TDD state machine, confirmation gate, and
  risk classifier; run it after touching any determinism source.
- Mutation contract: keep `presets/shared/mutation_runner.py` as the
  reference behavior (deterministic operators + rollback + exit codes) when
  substituting Stryker/PITest/Mutmut on other stacks.

### 5.3 Change checklist (keep determinism intact)

A slash command is defined in several synchronized surfaces. When adding or
modifying one, update **all** of them or routing silently drifts:

1. `src/core/presets/workflow-commands.ts` — command name + Zod schema.
2. `src/core/ccep/profiles.ts` — phases, agents, gates, risk rules.
3. `src/core/ccep/workflows/*.yml` — profile YAML source (if present).
4. `.agents/workflows/cc-<name>.md` — the human/agent workflow narrative.
5. Per-runner generated files (`presets/<runner>/commands/…`) — regenerate
   via the install command, don't hand-edit.

Then verify: `bun test`, `bun run dev ccep profile <name>`, and
`bun run dev doctor`.

---

## 6. Skills: categories, stack bindings, and workflow usage

Skills are the knowledge layer agents apply while a workflow runs. They are
installed per runner from `presets/<runner>/skills/` into the runner's
skill directory (this repo dogfoods the agy layout: `.agents/skills/`).

### 6.1 How skills plug into workflows

Three binding mechanisms, all explicit:

1. **Workflow steps name the skill.** E.g. `/cc-backlog` says "Apply skill
   `backlog`", `/cc-tdd-cycle` says "Invoke skill `testing-tdd`",
   `/cc-council` and `/cc-iterative` invoke the `council` skill,
   `/cc-security` loads the matching `security-*` domain skill.
2. **Stack agent contracts invoke focus skills.** Each stack preset ships
   agent contracts (`presets/<stack>/agents/*.md`) that mandate skill
   invocations, e.g. the TALL implementer must invoke
   `tailwind-responsive-auditor` before finishing; the TS architect invokes
   `drizzle-schema-architect` when defining schemas. The preset manifest's
   `agents[].focus` list is the source of those labels (also injected into
   generated council agents).
3. **Session-start routing.** Skill `using-cc-skills` maps intent →
   command → skill before work begins; runners may also auto-load scoped
   skills (see `AGENTS.md` → Skills).

### 6.2 Skill categories

| Category | Skills | Used by |
| -------- | ------ | ------- |
| Workflow/process | `using-cc-skills`, `openspec`, `backlog`, `evaluation`, `testing-tdd`, `council`, `commit`, `find-skills` | All `/cc-*` workflows |
| Command mirrors (`cc-*`) | `cc-feature`, `cc-fix`, `cc-refactor`, `cc-review`, `cc-test-plan`, `cc-tdd-cycle`, `cc-spec-mutation`, `cc-api-contract`, `cc-db-migration`, `cc-pagespeed` | Full workflow text per command, installed per runner |
| App security | `security` (OWASP) | `cc-security`, `cc-review` |
| Security domains (`security-*`) | 19 skills: `recon`, `vuln-assessment`, `web`, `cloud`, `network`, `mobile`, `crypto`, `ai-llm`, `blue-team`, `red-team`, `exploit-dev`, `malware-analysis`, `reverse-engineering`, `incident-response`, `threat-hunting`, `log-analysis`, `soc-automation`, `grc`, `ot-ics` | `cc-security` (domain in `$ARGUMENTS`) |
| Orchestration | `multi-agent-orchestration`, `workflow-orchestration-patterns`, `conductor-setup` | Council/pipeline design |
| Auxiliary | `code-review`, `pagespeed-perf`, `pagespeed-insights`, `api-versioning`, `astro`, `android`, `php-pro`, `python`, … | On demand |

### Web interface work

The shared [web-design-engineering](skills/web-design-engineering/SKILL.md) skill
adds contextual UI criteria to feature, fix, review, and OpenSpec workflows. It
activates for web layout, component behavior, feedback, motion, or requested UI
audits; React/Tailwind alone, backend-only tasks, and native mobile do not trigger
it. All seven runners receive it through their existing preset installers.

Reuse product components and tokens. Static pages need no invented animations;
durations and curves are contextual choices. Example acceptance: Escape during a
dialog’s entrance closes it, returns focus to its trigger, and never reopens it
from a stale callback; reduced motion preserves these actions without spatial
movement. Test the state behavior and verify the interaction in a browser. If the
browser is unavailable, record the visual/interaction check as pending.

Requested audits produce prioritized findings; out-of-scope opportunities remain
suggestions until backlog creation is requested. Existing review axes, severities,
CCEP contracts, and scorecard weights remain authoritative. Tailwind, framework,
PageSpeed, and evaluation skills retain their responsibilities.

### 6.3 Stack presets and their skill bindings

Stack presets ship an agent-contract layer; the skills themselves come from
the runner preset's skill library. Manifests live in
`presets/<stack>/<stack>.yml`.

| Preset | Stack | Agent | Focus skills (from manifest `agents[].focus`) |
| ------ | ----- | ----- | --------------------------------------------- |
| `ts-next-drizzle` | Next.js, Astro, Tailwind, Drizzle, Bun, Postgres | architect | `nextjs-typescript`, `drizzle-schema-architect`, `tailwind-responsive-auditor`, `seo-analytics-injector` |
| | | implementer | `nextjs-typescript`, `drizzle-schema-architect`, `tailwind-responsive-auditor`, `auth-token-inspector` |
| | | tester | `nextjs-typescript`, `tdd-mutation-tester` |
| | | reviewer | `tailwind-responsive-auditor`, `auth-token-inspector` |
| `spring-kotlin-jpa` | Spring Boot, Kotlin, Gradle, JPA/Hibernate | architect | `spring-kotlin-jpa`, `spring-auth-auditor` |
| | | implementer | `spring-kotlin-jpa`, `jpa-nplusone-detector`, `spring-auth-auditor` |
| | | tester | `spring-kotlin-jpa`, `tdd-mutation-tester` |
| | | reviewer | `jpa-nplusone-detector`, `spring-auth-auditor` |
| `laravel-tall` | Laravel, Blade, Livewire, Alpine.js | architect | `laravel-tall`, `livewire-alpine-bridge` |
| | | implementer | `laravel-tall`, `livewire-alpine-bridge`, `tailwind-responsive-auditor` |
| | | tester | `laravel-tall`, `tdd-mutation-tester` |
| | | reviewer | `tailwind-responsive-auditor`, `auth-token-inspector` |
| `python-data-api` | Python, FastAPI, Django, uv | architect | `python-data-api`, `fastapi-pydantic-strict` |
| | | implementer | `python-data-api`, `fastapi-pydantic-strict` |
| | | tester | `python-data-api`, `tdd-mutation-tester` |
| | | reviewer | `fastapi-pydantic-strict`, `auth-token-inspector` |

Related library skills used by these stacks: `laravel-specialist`,
`spring-boot-kotlin`, `spring-boot-feature`, `spring-boot-testing-strategy`,
`jpa-postgres`, `python-django-stack`, `python-fastapi-stack`, `django-orm`,
`django-testing`, `django-uv`, `sqlalchemy`.

Install/refresh a preset target with `bun run dev install preset --target
<runner>` (local) — maintainer-reserved stubs are skipped automatically.

### 6.4 Intent → command → skill (from `using-cc-skills`)

| Intent | Command | Skills to apply |
| ------ | ------- | --------------- |
| New backlog item | `/cc-backlog` | `backlog` |
| Deliver a BC-xxx item | `/cc-openspec` | `openspec` |
| New feature | `/cc-feature` | `openspec` + `testing-tdd` |
| Bug fix | `/cc-fix` | `testing-tdd` |
| Review a diff | `/cc-review` | `evaluation` |
| TDD cycle only | `/cc-tdd-cycle` | `testing-tdd` |
| Scorecard / suites | `/cc-scorecard` | `evaluation` |
| Performance audit | `/cc-pagespeed` | `pagespeed-perf` |
| Security review/hardening | `/cc-security` | `security` + matching `security-*` |

Then run the matching CLI gate (`openspec validate`, `scorecard create
--from-diff`, `hook pre-tool`, `scorecard suite-run`). Rule of thumb: **pick
one slash command, follow its skill, invoke the CLI for gates — do not
invent a parallel process.**

---

## 7. Notes, exceptions, and references

- **Exceptions to the bootstrap:** `/cc-council` and `/cc-pipeline` do not
  run the Step 0 CCEP bootstrap; their governance gates are internal
  (council deliberation STOP, spec/verdict gates). `/commit` and
  `/graphify` are utility commands outside the CCEP set.
- **Model tiers:** heavy reasoning (`architect`, `security-reviewer`,
  `reviewer`) on high-effort models; `implementer`/`tester` on fast coding
  models; `repo-explorer`/`task-coach`/`docs` on lightweight models.
- **Loop mode:** on failing tests, cycle `implementer` → `tester` up to 3
  times, then escalate to a human with diagnostics.
- **Hard rules:** never read `.env`/secrets; protected branches are
  push/rebase/reset-free; `git commit`/`checkout`/`switch` require human
  confirmation (see `AGENTS.md` → Hard Rules).

References:

- CLI commands — [`docs/cc-commands.md`](docs/cc-commands.md)
- CCEP protocol — [`docs/CCEP.md`](docs/CCEP.md)
- SDD delivery — [`docs/SDD.md`](docs/SDD.md)
- Routing policy — [`docs/routing-policy.md`](docs/routing-policy.md)
- End-user quickstart — [`docs/usage-cc.md`](docs/usage-cc.md)
- Agent contracts — [`AGENTS.md`](AGENTS.md), `.agents/AGENTS.md`
- Workflow sources — `.agents/workflows/cc-*.md`,
  `src/core/ccep/profiles.ts`, `src/core/presets/workflow-commands.ts`

