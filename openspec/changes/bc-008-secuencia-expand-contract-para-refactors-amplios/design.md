# Design: Secuencia expand-contract para refactors amplios en /cc:refactor

## Approach

(To be completed in design phase.)

## Files Affected

Actualizar .claude/commands/cc/refactor.md con la secuencia y su relación con Depends on.

## Acceptance Criteria

- /cc:refactor distingue refactor amplio de rebanada vertical por blast radius
- La secuencia expand-migrate-contract mantiene el árbol verde entre lotes
- `cc impact` cuantifica el blast radius antes de secuenciar los lotes
