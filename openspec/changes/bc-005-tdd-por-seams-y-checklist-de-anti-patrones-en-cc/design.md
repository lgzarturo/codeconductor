# Design: TDD por seams y checklist de anti-patrones en /cc:tdd-cycle

## Approach

Extender `presets/claude/commands/cc/tdd-cycle.md` (fuente canónica y testeada;
`.claude/commands/` está gitignoreado, ver precedente BC-004) con un paso
explícito de acuerdo de seams antes de escribir cualquier test, y un checklist
de anti-patrones antes de declarar el RED Phase Report listo. El contrato del
rol Tester se extiende en `presets/claude/CLAUDE.md` (precedente BC-003: las
extensiones de contrato de rol viven en este archivo, no en el `CLAUDE.md`
raíz).

## Tradeoffs

- Elegido: insertar el paso de seams como `### 1a` (antes del actual
  "Scope clarification", renumerado a `1b`) porque reutiliza la estructura de
  fases existente sin romper la secuencia RED→GREEN→REFACTOR.
- Rechazado: crear una fase 0 separada para seams — descartado por ser una
  abstracción extra; el acuerdo de seams pertenece a la fase RED (Tester
  role), no es una fase independiente.
- Elegido: el checklist de anti-patrones vive tanto en el contrato del rol
  Tester (aplica a todo uso del rol) como referenciado en el gate del RED
  Phase Report de `tdd-cycle.md` (aplica específicamente al ciclo TDD).

## Files Affected

- `presets/claude/commands/cc/tdd-cycle.md` — añade `### 1a — Agree on the
  seam` (antes de escribir el test) y `### 1d — Anti-pattern checklist`
  (antes del RED Phase Report); refuerza "una sola rebanada vertical" en la
  sección "Before you begin".
- `presets/claude/CLAUDE.md` — añade el checklist de los tres anti-patrones
  (implementation-coupled, tautológico, horizontal slicing) a la sección
  `### Tester`.
- `test/ccep/bc-005-tdd-cycle-seams-anti-patterns.test.ts` — tests que
  verifican el paso de seams antes del test, el checklist de anti-patrones,
  y la reafirmación de red-before-green con una sola rebanada vertical.

## Acceptance Criteria Validation

- `El flujo acuerda explícitamente los seams antes de escribir cualquier
  test`: el nuevo `### 1a — Agree on the seam` precede a "Write the failing
  test" y bloquea continuar sin identificar el seam.
- `El rol Tester verifica los tres anti-patrones antes de declarar tests
  listos`: el checklist (implementation-coupled, tautológico, horizontal
  slicing) se añade al contrato del rol Tester y se referencia como gate
  antes del RED Phase Report.
- `Cada ciclo respeta red-before-green con una sola rebanada vertical`: se
  refuerza explícitamente en "Before you begin" que cada ciclo cubre una
  única rebanada vertical de comportamiento, manteniendo RED antes de GREEN.

## Out of scope

Cambiar el runner de tests del proyecto.
