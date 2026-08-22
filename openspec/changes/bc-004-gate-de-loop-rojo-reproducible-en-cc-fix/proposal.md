# Proposal: Gate de loop rojo reproducible en /cc:fix

## Why

Portar la fase 1 de diagnosing-bugs como gate obligatorio en /cc:fix; antes de hipotetizar hay que construir un comando tight y red-capable que maneje la ruta real del bug y afirme el síntoma exacto del usuario.



## What Changes

- Actualizar .claude/commands/cc/fix.md para bloquear la implementación hasta tener el loop; anclar el loop como check de cc verify.

## Capabilities

- **New Capabilities:** (to be refined in design phase)
- **Modified Capabilities:** (to be refined in design phase)

## Impact

See design.md for technical impact.

**Out of scope:** Automatizar la construcción del loop; sigue siendo trabajo del agente.
