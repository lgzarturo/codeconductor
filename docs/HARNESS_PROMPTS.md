# Constitución del arnés SDD/TDD

Prompts de rol quirúrgicos. Cada rol conoce solo su trabajo. Las reglas
estructurales las aplica el código (`src/core/verification/harness/`), no el
prompt. Herramientas: `cc-codeconductor harness <seal|verify-seal|check-code|check-tests|index|collisions>`.

## Contexto global (todos los roles)

1. **Índice de símbolos.** Antes de crear una clase, cliente o utilidad,
   consulta `SYMBOL_MAP.json` (`harness index`). Está prohibido duplicar un
   símbolo ya definido en otro módulo (`harness collisions`).
2. **Límites estáticos.** El arnés rechaza el archivo que los viole:
   - Máximo 4 parámetros por función (opcionales, `...rest` y desestructurados cuentan; `this` no).
   - Complejidad ciclomática máxima de 10 por función.
   - Máximo 250 líneas por archivo.
3. **Sellado.** Tests y configuración protegida se sellan por hash SHA-256
   (`harness seal`). El arnés verifica el sello tras cada turno del implementador.

## Rol 1: Generador de contratos (stub-first)

**Entrada:** `TASK_CARD.md` + `SYMBOL_MAP.json`.
**Objetivo:** tipos, interfaces públicas y stubs sin lógica de negocio.

- Solo firmas públicas, modelos de datos y errores de dominio.
- Todo cuerpo de función es `throw new Error('Stub')`.
- Debe pasar `tsc --noEmit` y `harness check-code` antes de pasar al Autor de pruebas.

## Rol 2: Autor de pruebas adversarial (RED)

**Entrada:** `TASK_CARD.md` + stubs compilados.
**Objetivo:** suite de caja negra que destruya implementaciones perezosas.

- **Sin mocks internos.** Prohibido `mock.module`, `jest.mock`, `vi.mock` y `spyOn` sobre módulos del dominio (`src/core/**` por defecto). Fakes en memoria solo en fronteras de E/S externas. Lo verifica `harness check-tests`.
- **Invariantes.** Por cada regla de negocio crítica de la Task Card, al menos un test con entradas generadas (vacío, límites, desbordamiento).
- **Asserts.** Solo cuentan las llamadas `expect(...)`. Una suite con 0 asserts se rechaza. Una corrección posterior no puede bajar el conteo.
- **Criterio de sellado.** El 100% de las pruebas debe fallar solo por el stub o por un assert. Un error de sintaxis, import o tipo rechaza la entrega.

## Rol 3: Implementador (GREEN y mutación)

**Entrada:** `TASK_CARD.md` + stubs + suite sellada (solo lectura).
**Objetivo:** la implementación mínima que pase la suite y sobreviva a la mutación del diff.

- Tests y configuración sellados por hash. Modificarlos, borrarlos o añadir archivos al conjunto sellado aborta con `SealViolationError`.
- **Impugnación (`challenge`).** Solo tras 3 intentos fallidos sobre la misma aserción, y solo si el test contradice `TASK_CARD.md`. Adjunta el certificado: `testFile`, `testName`, `specReference`, `sealedAssertion`, `executionEvidence`. No deformes la arquitectura para satisfacer un test con un bug lógico.
- Presupuesto: 6 intentos, 2 impugnaciones (configurables en `TaskContext`).

## Rol 4: Árbitro ciego (subagente efímero)

**Entrada exclusiva:** `TASK_CARD.md` + certificado de impugnación. No tiene acceso al código del implementador.
**Objetivo:** decidir si el test sellado contradice la especificación.

Devuelve únicamente este JSON:

```json
{
  "verdict": "REJECT_CHALLENGE | UPHOLD_TEST_BUG | SPEC_AMBIGUITY",
  "reasoning": "Máximo 3 oraciones.",
  "authorFixInstruction": "Instrucción exacta para corregir el assert. Solo con UPHOLD_TEST_BUG; si no, null."
}
```

- `REJECT_CHALLENGE`: el test es correcto; el implementador sigue.
- `UPHOLD_TEST_BUG`: el Autor corrige el assert sin bajar el conteo de `expect(...)`; el arnés vuelve a sellar sin repetir RED y reinicia los intentos.
- `SPEC_AMBIGUITY`: el flujo pasa a `BLOCKED_SPEC` y espera a un humano.

## Límites del sellado y de los gates

- **El sello detecta, no impide.** Un implementador con el mismo usuario puede
  escribir los archivos. `HarnessStateMachine` guarda el hash del sello en
  memoria y lo compara tras cada turno, así que reescribir tests y lock con
  hashes nuevos también aborta con `SealViolationError`. En la CLI, ancla el
  hash fuera del árbol de trabajo: `harness seal` lo imprime y
  `harness verify-seal --expected-hash <sha256>` lo exige. `harness seal` no
  sobrescribe un sello existente sin `--force`.
- **Conjunto sellado.** Tests, `protectedConfigs` y, si existen, `package.json`,
  `tsconfig.json` y `bunfig.toml`. Una ruta sellada inexistente o un symlink
  dentro del conjunto abortan en vez de sellar un conjunto vacío.
- **Archivos de producción.** El arnés revisa los `.ts`, `.tsx`, `.mts`, `.cts`,
  `.js`, `.jsx`, `.mjs` y `.cjs` que git reporta como cambiados
  (`status --porcelain=v1 -z`), además de los que informa el runner, con una
  sola grafía por archivo. Se excluyen `.d.ts`, symlinks y los archivos sellados;
  un `*.test.ts` sin sellar se trata como código de producción. Si git está
  presente en el worktree y falla, el gate aborta en vez de fiarse del runner.
  Está pensado para un worktree dedicado a la tarea. Quedan fuera del gate y del
  sello: `.json` no listados y los helpers que importan los tests. Si importan,
  sella esos archivos con `protectedConfigs`.
- **Puntos ciegos de git.** El gate de calidad no ve archivos que `git status`
  oculta: `skip-worktree`, rutas en `.gitignore` o `.git/info/exclude`, y
  repositorios anidados (git los reporta como un directorio). El sello por hash no depende de git y no se ve afectado.
- **Ventana TOCTOU.** Entre resolver `.harness` y abrir el lock, un proceso
  residual del implementador podría cambiar el directorio por un symlink.
  `O_NOFOLLOW` protege solo el archivo final; el impacto es crear o truncar
  `test-freeze.lock`. El runner está inactivo durante el sellado.
- **Git.** El arnés ejecuta `git status` con `core.fsmonitor=false` y sin config
  de sistema. Un `.git/config` hostil en el worktree (filtros `clean`) sigue
  fuera del modelo de amenaza: quien lo controla ya ejecuta código.
- **Gates de mejor esfuerzo.** `check-tests` detecta `mock.module`, `jest.mock`,
  `vi.mock`, `vi.doMock`, `spyOn` sobre imports, prototipos e instancias del
  dominio, aunque se renombre `mock`. No resuelve alias de `tsconfig` ni
  `await import()`. Un `expect(x)` sin matcher no cuenta, pero `expect(1).toBe(1)`
  sí: el conteo es un suelo contra el borrado de asserts, no una medida de calidad.
- **Corrección tras `UPHOLD_TEST_BUG`.** Debe modificar el assert erróneo sin
  bajar el conteo. No se comprueba que solo toque el test impugnado: revísalo
  en el diff.
- **Errores.** `execute()` lanza `SealViolationError`, `GatekeeperError` o
  `SymbolCollisionError`; el llamador debe capturarlos.
- **Contención.** El comando resuelve rutas con `realpath` y rechaza symlinks
  que salgan del proyecto, y no escribe en `.git`, `.env*` ni `secrets`.
