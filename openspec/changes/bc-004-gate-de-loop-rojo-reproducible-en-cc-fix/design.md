# Design: Gate de loop rojo reproducible en /cc:fix

## Approach

Insertar un nuevo Step 1.5 ("Red loop gate") entre la validación del Task
Card (Step 1) y el enrutamiento por riesgo (Step 2) en el comando canónico
`presets/claude/commands/cc/fix.md`. El gate exige producir y correr un
comando de reproducción determinista que afirme el síntoma exacto reportado
por el usuario (RED) antes de continuar. La evidencia del run se persiste
como un archivo `EvidenceSchema` con `type: 'test'` en
`.codeconductor/evidence/`, reutilizando el reconocimiento ya existente de
evidencia tipo `'test'` en `isPassingEvidence()`
(`src/core/verification/verification-runner.ts`) — sin tocar código de
verificación.

## Tradeoffs

- Elegido: reutilizar el tipo de evidencia `'test'` ya soportado por
  `verification-runner.ts`, porque `cc verify --task <id>` ya lo lee sin
  cambios de código (stdlib-first / YAGNI: no se extiende el schema).
- Rechazado: añadir un nuevo `type: 'red-loop'` a `EvidenceSchema` y
  enseñarle a `isPassingEvidence()` a reconocerlo — descartado por ser una
  abstracción innecesaria para un caso ya cubierto por `'test'`.

## Files Affected

- `presets/claude/commands/cc/fix.md` — añade el Step 1.5 (gate) entre Step 1
  y Step 2; el gate bloquea el avance a Step 2 sin un comando reproducible
  corrido al menos una vez.
- `test/ccep/bc-004-fix-red-loop-gate.test.ts` — tests que verifican la
  posición del gate, su carácter determinista/exacto, y el anclaje a
  `cc verify` como evidencia.

## Acceptance Criteria Validation

- `/cc:fix exige un comando reproducible corrido al menos una vez antes de
  hipotetizar`: el Step 1.5 bloquea explícitamente el avance a Step 2 sin
  haber corrido el comando.
- `El loop documentado es determinista y afirma el síntoma exacto del
  usuario`: el gate exige que el comando sea determinista y que su
  aserción coincida con el síntoma exacto del Task Card (actual vs.
  expected), no un error genérico.
- `` `cc verify --task <id>` refleja el loop rojo como evidencia de
  verificación ``: el gate instruye escribir evidencia `type: 'test'` en
  `.codeconductor/evidence/`, que `runVerification()` ya lee sin cambios de
  código.

## Out of scope

Automatizar la construcción del loop; sigue siendo trabajo del agente.
