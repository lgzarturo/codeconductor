# Análisis de mejoras — validación de código, TaskCards, council y OpenSpec (2026-08)

**Fecha:** 2026-08-28
**Alcance:** contrato de TaskCard en los flujos CCEP, motor de consenso del
council, loop de OpenSpec y gates de validación de código.
**Estado del repo analizado:** `package.json` y `VERSION` en `1.0.0`,
`docs/current-status.md` en `0.5.0`, `bun test` → 2303 pass / 1 fail preexistente
(`CC-08 CLI contracts > canonical status document tracks the published package version`),
`bun run typecheck` limpio.

Este documento es **solo análisis**: no cambia comportamiento. Cada hallazgo
incluye evidencia en código y una propuesta accionable, y al final hay items de
backlog listos para pegar en `BACKLOG.md`.

---

## Resumen ejecutivo

Los tres flujos comparten el mismo problema estructural: **el contrato está
documentado pero no es ejecutable**. Hay schemas Zod ricos y documentación
excelente (`docs/task-card-template.md`), pero los puntos donde el framework
debería *fallar en cerrado* aceptan cualquier cosa:

1. **TaskCard no se valida nunca.** `taskCard.requiredFields` existe en los 10
   perfiles de workflow y en `WorkflowProfileSchema`, pero ningún módulo lo lee.
   No hay comando `ccep taskcard validate`, no hay schema para el TaskCard
   markdown de `docs/task-card-template.md`, y conviven **tres formas** de
   TaskCard con adaptadores con pérdida.
2. **El council aprueba por mayoría sin quórum, sin roster y sin mirar la
   severidad de los findings.** Un solo verdict `APPROVED` con `confidence`
   ausente aprueba un cambio de riesgo alto; verdicts duplicados del mismo
   `agentId` cuentan dos veces en mayoría.
3. **El loop de OpenSpec no cierra.** `setTaskCardStatus`, `canTransition` y
   `archiveItemInMarkdown` existen y están testeados, pero **ningún comando CLI
   los usa**: `openspec next` devuelve siempre la misma TaskCard porque no hay
   forma de marcarla `done`.
4. **La validación de código del propio repo no tiene lint ni gate de
   cobertura**, y el output del council no se valida contra su schema.

Prioridad sugerida: (P0) cerrar el loop de OpenSpec y el quórum del council,
(P1) hacer ejecutable el contrato de TaskCard, (P2) gates de validación de
código y unificación de schemas.

---

## 1. Validación del TaskCard en los flujos de trabajo

### 1.1 `taskCard.requiredFields` es decorativo

`WorkflowProfileSchema` acepta `taskCard: { type, requiredFields,
optionalFields }` (`src/validation/schemas.ts`) y 10 de los 18 perfiles lo
declaran (`feature`, `fix`, `refactor`, `api-contract`, `db-migration`,
`iterative`, `prototype`, `tdd-cycle`, `test-plan`, `triage`). Un `rg
requiredFields src/` fuera de `profiles.ts` y `schemas.ts` no devuelve **ningún
consumidor**: no hay validación, ni en `ccep validate`, ni en
`confirmation-gate.ts`, ni en el prompt compiler.

Consecuencia: el flujo `fix` declara requerir `reproductionSteps`,
`actualBehavior` y `expectedBehavior` y ningún schema del repo define esos
campos — el gate documentado ("sin TaskCard válida no arranca ningún agente",
`docs/task-card-template.md`) no existe en código.

**Propuesta**
- Añadir `TaskCardIntakeSchema` (Zod) con los campos del template markdown:
  `id`, `title`, `type`, `risk`, `status`, `scope.files`, `scope.boundaries`,
  `context`, `acceptanceCriteria`, `constraints`, `routing.agent`,
  `routing.requiresHumanReview`, `routing.requiresTests`,
  `routing.contextScope`, `dependsOn`, `notes`.
- Añadir un validador `validateTaskCardForProfile(profile, card)` que compruebe
  `requiredFields` del perfil contra la card y devuelva `ValidationIssue[]` con
  el mismo formato que `backlog-validator.ts`.
- Exponerlo como `cc ccep taskcard --command <wf> --input @card.json` y como
  gate de la fase `intake` (fallo → exit 1, igual que `ccep validate`).
- Reglas de negocio, no solo forma: `status: draft` nunca es enrutable,
  `risk: high` obliga `requiresHumanReview: true`, `type != docs|review` obliga
  `requiresTests: true`, criterios de aceptación no vagos (reutilizar
  `isVagueCriterion` de `backlog-validator.ts`, hoy duplicable y encerrado en
  OpenSpec).

### 1.2 Tres TaskCards distintas y adaptadores con pérdida

| Forma | Definición | Uso |
| --- | --- | --- |
| `TaskCard` (interface) | `src/core/pipeline/workflow-loop.ts` | pipeline experimental |
| `CanonicalTaskCardSchema` | `src/validation/schemas.ts` | Product OS / orchestrator |
| `OpenspecTaskCardSchema` | `src/validation/schemas.ts` | loop de OpenSpec |

Los adaptadores pierden información de forma silenciosa:

- `canonicalToPipelineTaskCard` (`src/core/product/task-card-adapter.ts`) fija
  `scope.out: []` — las **boundaries**, que el template describe como "no
  negociables", desaparecen; también se pierden `dependencies`,
  `evidenceRequired` y `status`.
- `openspecTaskCardToPipelineTaskCard` (`src/core/openspec/task-card-adapter.ts`)
  parte `item.scope` por comas y mete `item.risks` (texto libre) como
  `constraints`, y deriva `risk` solo de la prioridad (`P0→high`), ignorando la
  tabla de clasificación de riesgo de `AGENTS.md` (migración de BD, API
  pública, auth/pagos ⇒ `high` sin importar la prioridad).
- `OpenspecTaskCardSchema` no tiene `risk`, `scope`, `constraints` ni
  `evidenceRequired`: la card que ejecuta el agente es más pobre que el
  contrato documentado.

**Propuesta**
- Declarar `CanonicalTaskCardSchema` como **única** fuente de verdad, añadirle
  `boundaries: string[]`, `requiresHumanReview`, `requiresTests`,
  `contextScope` y `type` obligatorio, y convertir las otras dos en vistas
  derivadas (`toPipelineTaskCard`, `toOpenspecPhaseCard`).
- Tests de round-trip (canonical → vista → canonical) que fallen ante pérdida
  de campos: es la garantía barata contra la regresión de scope/boundaries.
- Clasificar riesgo con una función explícita
  (`classifyRisk({type, targetFiles, signals})`) que implemente la tabla de
  `AGENTS.md`, en lugar de `P0→high` por prioridad.

### 1.3 Doble fuente de verdad de los perfiles

`src/core/ccep/profiles.ts` (296 líneas) duplica los 18 YAML de
`src/core/ccep/workflows/`. `loadWorkflowProfile` prefiere el YAML y cae al
objeto TS. Hay parity test de orden de routing (`test/routing-order-parity.test.ts`),
pero **no de `taskCard`**: `council.yml`, `openspec.yml`, `review.yml`,
`explore.yml`, `handoff.yml`, `clarify.yml`, `scorecard.yml` y `pagespeed.yml`
no declaran bloque `taskCard`, y nada obliga a que TS y YAML coincidan en ese
campo.

**Propuesta**: parity test campo a campo (deep equal del perfil completo) o,
mejor, eliminar `profiles.ts` como fuente y generar el fallback desde los YAML
en build (`scripts/build.ts`), dejando un único origen.

---

## 2. Flujo del council

Evidencia: `src/domain/council/council-consensus.ts`,
`src/domain/council/council-spec.ts`, `src/presets/council/council.yml`,
`src/core/ccep/workflows/council.yml`, `src/core/ccep/output-validator.ts`.

### 2.1 Mayoría sin quórum ni roster (P0)

`unanimousFailure()` valida roster, duplicados, IDs inválidos y verdicts
inesperados — pero **solo se invoca en el algoritmo `unanimous`**. En
`majority`:

- `councilConsensus([{status:'APPROVED', ...}])` → **APPROVED** aunque el
  council tenga 6 agentes declarados. No hay quórum mínimo.
- Dos verdicts con el mismo `agentId` cuentan dos veces (ballot stuffing);
  `expectedAgentIds` se ignora explícitamente.
- Un verdict con `status` inválido no invalida la ronda: no suma a ningún
  contador pero sí a `totalAgents` y a la media de confianza.

**Propuesta**: mover la validación de roster/duplicados/IDs a una función
previa común a ambos algoritmos, y añadir `quorum` a `ConsensusConfig`
(por defecto: `ceil(expectedAgentIds.length / 2)`; sin roster con `majority`,
mínimo 3 verdicts o escalar). Verdict inválido ⇒ `ESCALATED`, nunca ignorado.

### 2.2 `confidence` ausente vale 1.0

`const confidence = typeof v.confidence === 'number' ? v.confidence : 1.0;`
Un agente que no reporta confianza *sube* la media y puede sacar a la ronda del
umbral de escalado (0.7). El campo es opcional en `CouncilVerdictInputSchema`.

**Propuesta**: `confidence` obligatorio en el schema de entrada (o tratar la
ausencia como señal de escalado). Es un cambio de una línea con alto impacto en
la fiabilidad del gate.

### 2.3 Los findings `critical` no afectan al veredicto

`allFindings` se acumula y se emite, pero la severidad no entra en la decisión:
un council puede devolver `APPROVED` con N findings `critical` mientras nadie
haya puesto `securityVeto`. El veto es un booleano manual y separado de la
evidencia.

**Propuesta**: regla `criticalFindingsPolicy: 'escalate' | 'reject' | 'ignore'`
(por defecto `escalate`) y derivar el veto de seguridad de findings
`severity: critical` con `category` de seguridad, en vez de depender de que el
agente marque el flag.

### 2.4 Roster duplicado y desalineado

`DEFAULT_COUNCIL_AGENTS` (`council-spec.ts`) tiene 7 agentes —incluye
`security-reviewer`— y `src/presets/council/council.yml` tiene 6 (sin
`security-reviewer`). Nada valida que `expectedAgentIds` provenga del
`CouncilSpec` cargado, ni que los `id` sean únicos, ni que exista al menos un
agente con foco de seguridad cuando `allowSecurityVeto: true`.

**Propuesta**: `deriveConsensusConfig(spec)` que construya el roster desde el
`CouncilSpec` efectivo; `CouncilSpecSchema` con `id` único (refine) y roster
mínimo; test de paridad `council.yml` ↔ `DEFAULT_COUNCIL_AGENTS`.

### 2.5 La salida del council no se valida como council-verdict

En `src/core/ccep/output-validator.ts`:

```ts
'council-verdict': AgentOutputSchema,
```

`CouncilVerdictSchema` existe (con contadores, vetos, findings y verdicts
individuales) pero **no está registrado**. La fase `council-review` de
`council.yml` declara `outputSchema: council-verdict` y en la práctica valida
contra el schema genérico: cualquier `{status:'success', confidence:1}` pasa.
Además `CcepOutputFormatSchema` admite `'taskcard'` como formato de salida y no
hay schema `taskcard` en `SCHEMA_REGISTRY`.

**Propuesta**: registrar `CouncilVerdictSchema` y el futuro
`TaskCardIntakeSchema`; test que compruebe que **todo** `outputSchema`
referenciado por algún YAML de workflow existe en el registry (hoy ese test no
existe y el fallback `?? AgentOutputSchema` oculta el error).

### 2.6 El council no tiene comando

`councilConsensus` solo se usa desde `runWorkflowPipeline()` (librería
experimental). No hay `cc council` para agregar verdicts de un JSON y devolver
exit code (0 aprobado / 1 rechazado / 2 escalado), que es lo que haría el gate
usable desde CI o desde un slash command.

---

## 3. Flujo de OpenSpec

Evidencia: `src/commands/openspec.command.ts`,
`src/core/openspec/{backlog-planner,backlog-validator,openspec-state,openspec-generator}.ts`.

### 3.1 El loop no cierra (P0)

`openspec` expone `validate | scan | plan | status | next`. No hay forma de
avanzar el estado:

- `setTaskCardStatus()` — solo usado en tests.
- `archiveItemInMarkdown()` — solo usado en tests.
- `canTransition()` — solo usado en tests.

Resultado: `openspec next` devuelve indefinidamente la misma card `pending`;
`openspec status` siempre reporta `taskCardsDone: 0`; el item nunca pasa de
`PLANNED`; `tasks.md` del change se genera una vez y sus checkboxes nunca se
marcan.

**Propuesta**: añadir subcomandos que usen lo ya escrito y testeado:
`openspec start <cardId>` (`pending → doing`, item `PLANNED → IN_PROGRESS`),
`openspec done <cardId>` (`doing → done`, regenera `tasks.md`, actualiza
`Progress` proporcional a cards completadas), `openspec block <cardId> --reason`,
`openspec archive <itemId>` (exige todas las cards `done` y, si
`global.reviewRequired`, evidencia de la fase `review`).

### 3.2 Las transiciones de estado no se aplican

`handlePlan` escribe `status: PLANNED` en `BACKLOG.md` sin consultar
`canTransition`: un item en `IN_PROGRESS` o `BLOCKED` retrocede a `PLANNED`
saltándose la máquina de estados declarada en `ALLOWED_TRANSITIONS`. Además la
escritura de `BACKLOG.md` es un `readFile`/`writeFile` sin bloqueo ni backup, y
`updateBacklogItemInMarkdown` usa `new RegExp(...${itemId}...)` con el ID sin
escapar.

**Propuesta**: una única función `applyBacklogTransition(content, itemId, to)`
que valide con `canTransition` y falle con mensaje accionable; escapar el ID en
el regex; escritura atómica (temp + rename).

### 3.3 Drift entre backlog y TaskCards planificadas

`itemSnapshots` se calcula en `scan` y se guarda, pero `plan` **no lo consulta**:
`planTaskCardsForItem` conserva `existing?.status` aunque el item haya cambiado
de descripción o de criterios de aceptación. Se puede dar por hecha una card
`review` cuyos criterios ya no existen. Tampoco se detecta que
`global.tddRequired` cambió (el orden de fases cambia y las cards previas
quedan inconsistentes).

**Propuesta**: guardar el hash del item en cada TaskCard; en `plan`, si el hash
cambió, resetear a `pending` las cards afectadas y reportarlo en la salida
(`invalidatedCards: [...]`). Esto es "definir mejor las TaskCards" en el
sentido más práctico: que la card sea trazable a la versión del item que la
originó.

### 3.4 `validate` no cubre reglas de negocio evidentes

`validateBacklog` cubre IDs duplicados, dependencias desconocidas, ciclos y
criterios vagos (buen nivel). Faltan, todos baratos:

- Coherencia `status`/`progress` (`DONE` con `progress < 100`, `TODO` con
  `progress > 0`).
- `reviewRequired: yes` global e items `DONE` sin `Reviewer`.
- Items `READY`/`PLANNED` con dependencias no `DONE` (hoy solo se filtra al
  seleccionar, no se avisa).
- `Out of scope` vacío en items `P0`/`P1` (el campo tiene `default('')`, así que
  desaparece silenciosamente).
- Criterios de aceptación no verificables por número: `acceptanceCriteria`
  mínimo 1 en schema, pero sin tope ni chequeo de duplicados.
- `VAGUE_PATTERNS` está hardcodeado a inglés+español y no es configurable desde
  `.codeconductor/config.yml`.

### 3.5 Errores silenciados y salida no tipada

`handleScan` ignora el `Result` de `writeOpenspecState` (un fallo de escritura
se reporta como `success: true`). Todos los handlers devuelven `data: unknown`
con objetos ad-hoc; no hay schema de salida de la CLI, así que el contrato JSON
que consumen los slash commands no está verificado por tipos ni por tests de
forma.

**Propuesta**: schema Zod por subcomando (`OpenspecValidateOutputSchema`, …) y
`assert` en tests de contrato; propagar los errores de escritura.

### 3.6 El artefacto OpenSpec queda huérfano

`generateOpenspecChange` escribe `proposal.md`, `design.md`, `tasks.md` y
`specs/delta.md` con placeholders ("to be refined in design phase") y nunca se
regeneran: la fase `design` produce un `technical-plan` que no se escribe en
`design.md`, y no existe `openspec/changes/archive/`. De los 9 changes de este
repo, 4 (`bc-006`, `bc-008`, `bc-009`, `bc-011`) conservan el placeholder "To be
completed in design phase" pese a estar sus items en `DONE`; el resto se
rellenó a mano.

**Propuesta**: `openspec sync <itemId>` que vuelque el `technical-plan`
validado en `design.md` y regenere `tasks.md` desde el estado; `openspec
archive` que mueva la carpeta a `openspec/changes/archive/`.

---

## 4. Validación de código (gates del propio repo)

- **No hay linter.** Existe `.prettierrc` y `.editorconfig`, pero `package.json`
  no tiene script `lint` ni dependencia de ESLint/Biome, y el CI no lo ejecuta.
  Los gates son `typecheck` + `bun test` + `check:prompt-changelog`.
- **No hay umbral de cobertura.** El CI corre `bun test --coverage` y sube el
  `lcov.info` como artefacto, pero nada falla si la cobertura baja. No hay
  `bunfig.toml` con `coverageThreshold`.
- **Test rojo preexistente**: `CC-08 CLI contracts` exige que
  `docs/current-status.md` declare `Published package version: <package.json>`;
  `package.json` y `VERSION` están en `1.0.0` y el documento dice `0.5.0`. El
  propio gate de coherencia de versión está en rojo en `main`.
- **Sin pre-commit real**: `test/gates-pre-commit.test.ts` valida la *plantilla*
  de hook que se distribuye, pero el repo no tiene `.pre-commit-config.yaml` ni
  `.husky/`; el gate que el framework predica no está instalado en su propio
  repo.
- **`compileCheck` es opt-in y opaco**: `runCompileCheck` solo se ejecuta con
  `--allow-compile-check` o allowlist (correcto por seguridad), pero no hay
  reporte de por qué se omitió, así que un `verify` "verde" puede no haber
  compilado nada.

**Propuesta priorizada**
1. Arreglar la coherencia de versión (test rojo en `main`).
2. `bunfig.toml` con `coverageThreshold` por líneas/funciones (empezar en el
   valor actual y subirlo por olas, como hizo la auditoría 2026-07).
3. `lint` con Biome (una sola dependencia dev, sin plugins) o, si se quiere
   mantener stdlib-first estricto, un `scripts/lint.ts` con reglas propias
   (prohibir `any`, `as unknown as`, imports dentro de funciones).
4. Que `verify` marque explícitamente `compileCheck: 'skipped'` con motivo, y
   que el scorecard no puntúe `tests` sin evidencia de ejecución real.
5. Test de completitud del `SCHEMA_REGISTRY` (§2.5) — evita que un
   `outputSchema` mal escrito pase silenciosamente por `AgentOutputSchema`.

---

## 5. Items de backlog propuestos

Formato listo para `BACKLOG.md` (IDs a renumerar según el estado real):

```markdown
### BC-013 | Cerrar el loop de OpenSpec con start/done/block/archive

- Priority: P0
- Status: TODO
- Type: feature
- Depends on: none
- Description: openspec next devuelve siempre la misma TaskCard porque no existe
  ningún subcomando que cambie su estado; setTaskCardStatus, canTransition y
  archiveItemInMarkdown solo se usan en tests.
- Scope: src/commands/openspec.command.ts, src/core/openspec/openspec-state.ts,
  src/core/openspec/openspec-generator.ts
- Out of scope: Ejecutar agentes automáticamente al cerrar una card.
- Acceptance:
  - [ ] openspec start/done/block cambian el status de la TaskCard y lo persisten
  - [ ] openspec done regenera tasks.md y actualiza Progress del item
  - [ ] Las transiciones de BACKLOG.md se validan con canTransition y fallan con exit 1
  - [ ] openspec archive exige todas las cards done y mueve el change a archive

### BC-014 | Quórum, roster y confianza obligatoria en el consenso del council

- Priority: P0
- Status: TODO
- Type: feature
- Depends on: none
- Description: El algoritmo majority ignora expectedAgentIds, acepta verdicts
  duplicados y trata confidence ausente como 1.0, de modo que un único verdict
  aprueba un cambio de riesgo alto.
- Scope: src/domain/council/council-consensus.ts, src/validation/schemas.ts
- Out of scope: Cambiar los umbrales de confianza ya documentados (0.6 / 0.7).
- Acceptance:
  - [ ] La validación de roster, duplicados y verdicts inválidos aplica a majority
  - [ ] ConsensusConfig acepta quorum y escala cuando no se alcanza
  - [ ] Un verdict sin confidence escala en lugar de contar como 1.0
  - [ ] Los findings critical escalan o rechazan según criticalFindingsPolicy

### BC-015 | TaskCard ejecutable: schema canónico y gate por requiredFields

- Priority: P1
- Status: TODO
- Type: feature
- Depends on: none
- Description: taskCard.requiredFields se declara en 10 perfiles y no lo lee
  ningún módulo; conviven tres formas de TaskCard con adaptadores que pierden
  boundaries y dependencias.
- Scope: src/validation/schemas.ts, src/core/ccep/, src/core/product/task-card-adapter.ts,
  src/core/openspec/task-card-adapter.ts
- Out of scope: Parsear el TaskCard markdown legado de docs/task-card-template.md.
- Acceptance:
  - [ ] ccep taskcard valida una card contra requiredFields del perfil y sale 1 si falta alguno
  - [ ] CanonicalTaskCardSchema incluye boundaries, requiresHumanReview, requiresTests y contextScope
  - [ ] Tests de round-trip canonical → vista → canonical sin pérdida de campos
  - [ ] Una card en status draft nunca es enrutable

### BC-016 | Registrar council-verdict en el registry de output schemas

- Priority: P1
- Status: TODO
- Type: bug
- Depends on: none
- Description: SCHEMA_REGISTRY mapea council-verdict a AgentOutputSchema, así que
  la fase council-review valida contra el schema genérico y CouncilVerdictSchema
  nunca se aplica.
- Scope: src/core/ccep/output-validator.ts, test/ccep/
- Out of scope: Cambiar el contrato de salida de los demás agentes.
- Acceptance:
  - [ ] council-verdict valida contra CouncilVerdictSchema
  - [ ] Un test verifica que todo outputSchema referenciado en los YAML existe en el registry
  - [ ] El fallback silencioso a AgentOutputSchema deja de ocultar nombres inválidos

### BC-017 | Detección de drift entre backlog y TaskCards planificadas

- Priority: P2
- Status: TODO
- Type: feature
- Depends on: BC-013
- Description: plan conserva el status de las cards existentes aunque el item
  haya cambiado de criterios de aceptación; itemSnapshots se guarda pero no se
  consulta.
- Scope: src/core/openspec/backlog-planner.ts, src/commands/openspec.command.ts
- Out of scope: Versionado histórico de items del backlog.
- Acceptance:
  - [ ] Cada TaskCard guarda el hash del item que la originó
  - [ ] plan resetea a pending las cards cuyo item cambió y las reporta como invalidatedCards
  - [ ] Un cambio de tddRequired reordena las fases y reporta el impacto

### BC-018 | Gates de validación de código: versión, cobertura y lint

- Priority: P2
- Status: TODO
- Type: tech-debt
- Depends on: none
- Description: El test CC-08 de coherencia de versión está rojo en main, no hay
  umbral de cobertura pese a subir lcov en CI, y el repo no tiene linter ni
  pre-commit instalado.
- Scope: package.json, VERSION, docs/current-status.md, bunfig.toml, .github/workflows/ci.yml
- Out of scope: Añadir dependencias de lint con plugins más allá de una única herramienta.
- Acceptance:
  - [ ] bun test pasa en main sin fallos preexistentes
  - [ ] El CI falla si la cobertura baja del umbral declarado
  - [ ] Existe un script lint ejecutado por CI y por el hook pre-commit
```

---

## 6. Secuencia recomendada

1. **BC-018** primero (main en verde y umbral de cobertura) — sin gate no hay
   forma de validar los cambios siguientes.
2. **BC-013** y **BC-014** en paralelo: son los dos loops que hoy no cierran.
3. **BC-016** (una hora de trabajo, elimina un falso verde del council).
4. **BC-015** como cambio estructural, con los round-trip tests como red.
5. **BC-017** al final, apoyado en el estado ya cerrable de BC-013.
