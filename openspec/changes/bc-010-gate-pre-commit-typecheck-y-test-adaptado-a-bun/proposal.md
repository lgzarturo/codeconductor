# Proposal: Gate pre-commit typecheck y test adaptado a Bun

## Why

Portar setup-pre-commit adaptado a stdlib-first; un hook pre-commit mínimo que corre bun run typecheck y bun test sin añadir Husky ni lint-staged salvo que el proyecto destino ya los use.



## What Changes

- Plantilla de hook pre-commit y documentación del gate para agentes.

## Capabilities

- **New Capabilities:** stdlib-first git `pre-commit` installer (Bun typecheck + test) documented in `GATE.md` per runner preset
- **Modified Capabilities:** none (no Husky/lint-staged; no package.json dependency)

## Impact

See design.md for technical impact.

**Out of scope:** Imponer Prettier o lint-staged como dependencia obligatoria.
