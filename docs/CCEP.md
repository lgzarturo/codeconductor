# CCEP — CodeConductor Execution Protocol

CCEP-1 turns a slash command plus a free-form request into a deterministic,
schema-validated prompt for a single agent phase. It is the contract between the
CLI's workflow definitions and the agent that executes each phase.

**Source of truth:** `src/core/ccep/`.

---

## Pipeline

```
parseCommand → resolveContext → resolveWorkflowPhase → compilePrompt → validateAgentOutputBySchema
```

| Step | Function | Signature | Responsibility |
| --- | --- | --- | --- |
| Parse | `parseCommand` | `(command, userRequest, projectRoot) => CommandEnvelopeInput` | Validate the command against `CCEP_COMMANDS`, read `package.json`, produce the envelope. `parseCommandAsync` is the async variant. |
| Resolve | `resolveContext` | `(envelope, profile, projectRoot) => Promise<ExecutionContextInput>` | Hydrate the envelope: product knowledge (product-graph), AST source, detected stack, policies. |
| Phase | `resolveWorkflowPhase` | `(profile, phaseId) => ResolvedWorkflowPhase \| null` | Look up a phase in the workflow profile and extract its `role` and `outputSchema`. |
| Compile | `compilePrompt` | `({ role, phase, context, promptVersion }) => CompiledPrompt` | Assemble the seven layers into `{ layers, prompt }`. |
| Validate | `validateAgentOutputBySchema` | `(schemaName, data, role?) => ValidationResult` | Validate the agent's JSON output against the named Zod schema. |

`resolveFromCommand(command, userRequest, projectRoot, profile)` is a convenience
wrapper that runs parse + resolve in one call.

---

## Commands

`CCEP_COMMANDS` (see `WorkflowCommandSchema` in `src/validation/schemas.ts`):

```
feature  fix  refactor  review  test-plan  tdd-cycle
api-contract  db-migration  pagespeed  openspec  backlog  scorecard
council  iterative  explore  triage  prototype  handoff  clarify
```

Each command maps to a workflow profile. Bundled profiles live as YAML under
`src/core/ccep/workflows/` (`BUNDLED_WORKFLOWS_DIR`), e.g. `feature.yml`,
`fix.yml`, `review.yml`. A project may override a profile by placing a matching
YAML in its own config; `loadWorkflowProfile` prefers the project copy and falls
back to the bundled default via `loadWorkflowProfileFallback`.

---

## The seven prompt layers

`compilePrompt` emits layers in this fixed order (`PromptLayer.name`). The final
`prompt` string is `## <name>\n<content>` joined by blank lines.

| # | Layer | Content |
| --- | --- | --- |
| 1 | `system` | CCEP-1 operating rules: do not invent context, ask via structured output when data is missing, return valid JSON only, match the schema exactly. |
| 2 | `agent` | The role label (from `ROLE_LABELS`) and the assigned phase. Implementer/reviewer get role-specific output reminders. |
| 3 | `policies` | `context.policies` plus the `promptVersion` marker, JSON-serialized. |
| 4 | `knowledge` | `context.knowledge` — product domains, decisions, risks — JSON-serialized. |
| 5 | `ast` | `context.ast` — project structure (`source: 'product-graph' \| 'graphify' \| 'detect'`). |
| 6 | `task` | The envelope essentials: command, intent, phase, `userRequest`, project name. |
| 7 | `output_schema` | The expected output shape, selected by `context.outputSchema`. |

Known roles (`ROLE_LABELS`): `task-coach`, `architect`, `implementer`, `tester`,
`reviewer`, `docs`, `contract-builder`, `complexity-auditor`, `orchestrator`,
`repo-explorer`.

---

## Output schemas

`OUTPUT_SCHEMA_NAMES` (`src/core/ccep/output-validator.ts`):

```
planner-output  implementer-output  review-report  technical-plan
fix-intake-output  council-verdict  agent-output
```

`resolveOutputSchemaName(schemaName, role?)` normalizes a requested schema name;
unknown names fall back to `agent-output`. `parseJsonInput(raw)` parses agent
output before validation, and `validateOutputForRole(role, outputSchema, data)`
combines resolution and validation. A `ValidationResult` is
`{ valid, schema, errors?, data? }`.

The prompt-side schema bodies (the JSON skeletons injected into layer 7) are
defined in `prompt-compiler.ts` (`OUTPUT_SCHEMAS`); the validation-side Zod
schemas live in `src/validation/schemas.ts`. Keep the two in sync when adding a
schema.

---

## Extending CCEP

1. Add the command to `WorkflowCommandSchema` (`CCEP_COMMANDS`).
2. Add a workflow YAML under `src/core/ccep/workflows/` with its phases (each
   phase declares a `role` and an `outputSchema`).
3. If the phase needs a new output shape: add the Zod schema in
   `src/validation/schemas.ts`, register the name in `OUTPUT_SCHEMA_NAMES`, and
   add the prompt skeleton in `OUTPUT_SCHEMAS`.
4. No new runtime dependency is required — CCEP is plain TypeScript + Zod.
