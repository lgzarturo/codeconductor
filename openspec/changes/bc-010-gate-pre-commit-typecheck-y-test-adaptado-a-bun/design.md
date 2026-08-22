# Design: Gate pre-commit typecheck y test adaptado a Bun

## Approach

(To be completed in design phase.)

## Files Affected

Plantilla de hook pre-commit y documentación del gate para agentes.

## Acceptance Criteria

- El hook pre-commit ejecuta typecheck y test antes de permitir el commit
- El gate no añade dependencias externas cuando el proyecto no las tiene
- Un commit con typecheck fallido queda bloqueado por el hook
