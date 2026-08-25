# Design: Comando /cc:handoff para traspaso entre sesiones

## Approach

(To be completed in design phase.)

## Files Affected

Añadir al handoff generado la declaración explícita de context_scope (isolated/continuation/full) recomendado para la próxima sesión.

## Acceptance Criteria

- /cc:handoff produce un documento de handoff con el estado y los próximos pasos
- El documento declara el context_scope recomendado para la próxima sesión
- Una sesión nueva puede retomar el trabajo solo con el handoff
