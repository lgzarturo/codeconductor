# Design: Router /cc:ask

## Approach

Keep `/cc:ask` **out of CCEP** (no new `WorkflowCommandSchema` value). A pure function `recommendAskFlow` maps natural language onto a fixed catalog of six shipped slash commands. The CLI `ask` prints the recommendation with `executed: false`. Slash-command markdown tells the agent to run that CLI and **stop**.

Priority: openspec → tdd-cycle → review → refactor → fix → feature (default).

## Files Affected

- `src/core/ask/recommend-flow.ts`
- `src/commands/ask.command.ts`
- `src/cli/router.ts` (lazy import)
- `presets/*/…/ask.md` (or `cc-ask.md`)
- `test/ask-recommend.test.ts`

## Acceptance Criteria

- `/cc:ask` mapea un problema en lenguaje natural a un slash command concreto
- La recomendación justifica por qué ese flujo encaja con el problema
- El catálogo de flujos permanece alineado con los comandos disponibles
