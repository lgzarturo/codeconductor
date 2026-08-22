# Design: Gate de grilling en el rol Task Coach

## Approach

Añadir una sección "Grilling protocol" al contrato maestro
`presets/opencode/prompts/v1.0.0/task-coach.md` que obliga a estresar cada
supuesto del Task Card con una pregunta adversarial antes de marcar
`status: "success"`. Las preguntas sin resolver se vuelcan en
`questionsForUser`/`needsConfirmation` del `planner-output` (CCEP-1) ya
existente, que el `ConfirmationGate` (`src/core/ccep/confirmation-gate.ts`, sin
modificar) ya usa para detener el flujo. Se resincroniza la copia activa
`presets/opencode/agents/task-coach.md` con ese contrato, y se actualiza
`presets/claude/commands/cc/feature.md` Step 1 para nombrar explícitamente el
`ConfirmationGate` en vez de la prosa genérica actual.

## Tradeoffs

- Chosen: reutilizar `PlannerOutputSchema`/`ConfirmationGate` existentes (grill
  = más preguntas hacia el mismo canal) — el Out of scope de BC-007 prohíbe un
  motor de preguntas nuevo fuera de ccep.
- Rejected: módulo TS nuevo de "grilling score" — duplicaría
  `confidence`/`risks` ya existentes y violaría YAGNI.
- Chosen: editar `v1.0.0` in-place (no cortar `v1.1.0`) — `v1.0.0` aún no se
  publicó a npm; no hay proyecto en producción que se rompa.
- Rejected: bump a `v1.1.0` por la regla "minor: new instructions" — esa regla
  protege contratos ya publicados; no aplica aquí.
- Chosen: aplicar el mismo cuerpo (body) editado también en
  `presets/opencode/agents/task-coach.md` — su body ya era idéntico al de
  `prompts/v1.0.0/task-coach.md` (solo difiere el frontmatter, por diseño:
  `{{MODEL}}` simple vs. la tabla de documentación multi-proveedor), así que
  mantenerlo en sync es el paso 5 mandatorio de `docs/prompt-versioning.md`.
- Rejected: resincronizar también `presets/cursor/agents/task-coach.md` (este
  sí hallado en v0.5.0 real, sin sección CCEP-1 completa) — bug preexistente
  sin tooling de sync documentado; corregirlo aquí sería scope creep. Se
  documenta como riesgo, no se corrige en este cambio.

## Files Affected

- `presets/opencode/prompts/v1.0.0/task-coach.md` — sección "Grilling
  protocol" nueva + reglas CCEP-1 extendidas.
- `presets/opencode/agents/task-coach.md` — mismo cuerpo (body) que el
  contrato anterior; su frontmatter (`{{MODEL}}` simple) no cambia.
- `presets/claude/commands/cc/feature.md` — Step 1 ata el STOP al
  `ConfirmationGate` en vez de prosa sin mecanismo nombrado.
- `docs/prompt-versioning.md` — celda "Changes" de la fila `v1.0.0` ampliada
  (sin fila nueva).
- `CHANGELOG.md` — entrada `Changed` bajo `[Unreleased]`.

## Risks

- Grilling en rondas infinitas — mitigación: cada supuesto se estresa una sola
  vez, respetando "Ask at most one question per message".
- `presets/cursor/agents/task-coach.md` queda con el mismo drift — mitigación:
  fuera de Scope, registrado para un item de backlog futuro.
- Ningún test unitario ejecuta el comportamiento real de un prompt LLM —
  mitigación: el Tester cubre solo la superficie mecánica
  (`ConfirmationGate`); el contenido del prompt lo valida el Reviewer (eje
  Spec).

## Acceptance Criteria

- El Task Coach estresa supuestos antes de aceptar el Task Card — cubierto por
  la nueva sección "Grilling protocol", obligatoria antes de `status: "success"`.
- Un Task Card con preguntas abiertas detiene el flujo vía ConfirmationGate de
  ccep — las preguntas de grilling sin resolver pueblan `questionsForUser`, que
  `evaluateConfirmationGate` ya detiene (`reason: 'clarification'`).
- El Task Card final cubre los seis campos requeridos sin ambigüedad — el
  checklist de completitud existente se refuerza exigiendo grilling antes de
  considerar los campos definitivos; sin cambio de schema.
