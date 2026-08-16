# CCEP-1 — CodeConductor Execution Protocol

CCEP-1 is a **cross-cutting execution protocol** shared by all CodeConductor slash
commands. It does not replace specialized workflows (`/cc-feature`, `/cc-fix`,
`/cc-council`, etc.). Each command keeps its own purpose and phases; CCEP
standardizes how intent becomes structured context before any agent runs.

## Design principles

1. **Explicit command** — `command` comes from the slash (`/cc-fix` → `fix`), never
   inferred from free text.
2. **Structured envelope** — agents receive `CommandEnvelope` + `WorkflowProfile`, not
   raw user prose.
3. **Compiled prompts** — seven layers (system, agent, policies, knowledge, ast,
   task, output_schema) assembled by `PromptCompiler`.
4. **Workflow profiles** — each slash command declares phases, agents, gates, and
   output schemas in `src/core/ccep/profiles.ts`.
5. **Confirmation gates** — deterministic stops for ambiguity, high risk, or pending
   questions.

## Pipeline (shared Stages 0–2)

```text
Slash command (/cc-{command})
        │
        ▼
CommandParser        command + userRequest → CommandEnvelope
        │
        ▼
WorkflowProfileLoader   command → WorkflowProfile
        │
        ▼
ContextResolver      envelope + profile → ExecutionContext
        │
        ▼
PromptCompiler       context + role + phase → compiled prompt
        │
        ▼
ConfirmationGate     planner output → STOP or continue
        │
        ▼
Command-specific workflow phases (unchanged semantics)
```

## Supported commands

| Command | Profile ID | Primary output |
| ------- | ---------- | -------------- |
| `feature` | feature | TaskCard + Technical Plan |
| `fix` | fix | Fix intake + risk routing |
| `refactor` | refactor | Refactor plan + audit |
| `review` | review | Review report |
| `test-plan` | test-plan | Test plan |
| `tdd-cycle` | tdd-cycle | Red-green-refactor loop |
| `api-contract` | api-contract | API contract |
| `db-migration` | db-migration | Migration plan |
| `pagespeed` | pagespeed | PSI report |
| `openspec` | openspec | Backlog delivery |
| `scorecard` | scorecard | Agent evaluation |
| `council` | council | Council verdict |

## CLI

```bash
# Parse slash input into envelope (command is explicit)
npx cc-codeconductor ccep parse --command fix "login fails on Safari" --output json

# Load workflow profile
npx cc-codeconductor ccep profile council --output json

# Resolve full execution context
npx cc-codeconductor ccep resolve --command feature "Add CRUD" --output json

# Evaluate ConfirmationGate against planner JSON (stop => exit code 1)
npx cc-codeconductor ccep evaluate --command feature --input @planner.json --output json
```

## Slash command bootstrap

Every preset command includes **Step 0 — CCEP Bootstrap** before workflow-specific
steps. The bootstrap runs the CLI calls above and blocks delegation until
`ccep evaluate` reports that ConfirmationGate allows progress. Workflows that
include both `test` and `implement` phases use **test-before-implement** order.

## Schemas

Defined in `src/validation/schemas.ts`:

- `CommandEnvelopeSchema` (`protocolVersion: ccep-1`)
- `WorkflowProfileSchema`
- `ExecutionContextSchema`
- `PlannerOutputSchema`

## Versioning

| Artifact | Version |
| -------- | ------- |
| Protocol | `ccep-1` |
| Workflow profiles | `1` per command (YAML) |
| Agent prompts | `v0.6.0` (structured JSON output; installed alongside `v0.5.0`) |

Installed agent contracts (v0.6.0):

- `planner.md` — `PlannerOutputSchema`
- `implementer.md` — `ImplementerOutputSchema`
- `reviewer.md` — `ReviewerOutputSchema`

## CLI compile and validate (v1.2)

```bash
# Compile a phase prompt (defaults to promptVersion v0.6.0)
npx cc-codeconductor ccep compile --command feature --phase intake --role task-coach "Add CRUD" --output json

# Validate agent JSON output against the phase schema
npx cc-codeconductor ccep validate --command feature --phase implement --role implementer --output json \
  '{"status":"success","confidence":0.9,"warnings":[],"artifacts":[],"next_actions":[],"filesChanged":[],"tests":{"runner":"bun test","result":"passed"}}'
```

Use `--input @path/to/output.json` to validate from a file.

## Workflow YAML (v1.1)

Bundled defaults ship in `src/core/ccep/workflows/*.yml`. On `npx cc-codeconductor init`,
profiles are copied to `.codeconductor/workflows/` for project-level overrides.

Resolution order:

1. `.codeconductor/workflows/{command}.yml` (project override)
2. `src/core/ccep/workflows/{command}.yml` (bundled default)
3. Built-in fallback registry (`profiles.ts`)

Edit the project YAML to customize phases, gates, or routing without changing
CodeConductor source.

## Multi-runner bootstrap

All supported runners include **Step 0 — CCEP Bootstrap** in their slash commands:

- Cursor — `presets/cursor/commands/cc/`
- Claude — `presets/claude/commands/cc/`
- OpenCode — `presets/opencode/commands/cc-*.md`
- Agy — `presets/agy/workflows/cc-*.md`

Regenerate bootstrap blocks across runners:

```bash
bun run scripts/inject-ccep-bootstrap.ts
```

Prompts are an implementation detail. The protocol contract is the JSON schemas
and workflow profiles.
