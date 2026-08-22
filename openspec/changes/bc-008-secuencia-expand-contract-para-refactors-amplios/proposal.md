# Proposal: Secuencia expand-contract para refactors amplios en /cc:refactor

## Why

Portar el caso wide-refactor de to-tickets como secuencia expand, migrate por lotes y contract para cambios cuyo blast radius rompe muchos call sites, usando cc impact para dimensionar el radio.



## What Changes

- Actualizar .claude/commands/cc/refactor.md con la secuencia y su relación con Depends on.

## Capabilities

- **New Capabilities:** (to be refined in design phase)
- **Modified Capabilities:** (to be refined in design phase)

## Impact

See design.md for technical impact.

**Out of scope:** Refactors verticales normales que sí caben en un tracer bullet.
