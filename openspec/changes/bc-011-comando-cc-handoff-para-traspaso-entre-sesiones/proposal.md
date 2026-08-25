# Proposal: Comando /cc:handoff para traspaso entre sesiones

## Why

/cc:handoff ya existe y genera `.codeconductor/sessions/handoff.md` con estado, archivos tocados y próximo comando; falta que declare explícitamente el context_scope recomendado para la próxima sesión y verificación de que una sesión nueva puede retomar el trabajo solo con ese documento.



## What Changes

- Añadir al handoff generado la declaración explícita de context_scope (isolated/continuation/full) recomendado para la próxima sesión.

## Capabilities

- **New Capabilities:** (to be refined in design phase)
- **Modified Capabilities:** (to be refined in design phase)

## Impact

See design.md for technical impact.

**Out of scope:** Rediseñar el resto del documento de handoff; "compaction hook" y "context-injector" como módulos separados (no existen en este repo).
