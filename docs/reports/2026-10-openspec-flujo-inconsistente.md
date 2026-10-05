# Informe: flujo OpenSpec inconsistente en proyectos consumidores (2026-10)

**Alcance:** `openspec` (CLI + skills/presets) ejecutado desde Codex en el proyecto `adpilot` (log BC-012). Análisis estático del repo en `package.json:3` v1.6.1; no se modificó nada ni se ejecutó el CLI (la reproducción de H1 es por lectura de código + log; ver "Límites").
**Fuentes:** código en `src/`, `scripts/`, `presets/`, `skills/`, `.codeconductor/workflows/openspec.yml`, `test/`, `dist/index.js`. Las citas son `ruta:línea`. Lo no verificado en ejecución se marca **(inferido)**.

## Resumen ejecutivo

1. **Causa raíz del bloqueo de `next`:** `openspec next` corre un bucle compile-fix para tarjetas `test`/`implement` (`src/commands/openspec.command.ts:755`) y `runCompileCheck` usa `Bun.spawn` (`src/core/compilation/compile-checker.ts:293`). El bin publicado es `#!/usr/bin/env node` compilado con `--target=node` (`package.json:49`), así que bajo `npx` lanza `Bun is not defined`, el `catch` lo convierte en `exitCode:-1` y `next` sale con 1 y `compileCheck: "ran"`. Es exactamente el síntoma del log.
2. **La captura de evidencia TDD (`captureTddSuiteEvidence`) tiene el mismo defecto y además no existe como subcomando CLI**; por eso el agente tuvo que escribir un script ad hoc y ejecutarlo con `bun` (`openspec.command.ts:892`).
3. **`openspec done` regenera `tasks.md` desde plantilla en cada llamada** (`openspec.command.ts:906-912`): destruye ediciones y trazabilidad hechas por los agentes y deja todos los `- [ ]` de requisitos sin marcar. Ningún código marca `[x]` en FR/SC ni en los criterios de aceptación de `BACKLOG.md`; `archive` solo avisa.
4. **Los skills/presets/hook de SessionStart prescriben `bun run dev`** a proyectos consumidores (182 archivos; 89 en `presets/`, hook en `src/commands/hook.command.ts:78-84`). Por eso falló `bun run dev` ("Script not found").
5. **El ciclo deseado (explore → propose → tdd → implement → verify → review → archive → loop) no está modelado:** solo hay 5 fases-tarjeta (`discover/design/test/implement/review`); `verify`/`archive` son subcomandos sin tarjeta; no existe reabrir/rechazar ni bucle de re-review.
6. **La regla "If rejected … STOP and report to user"** (`presets/codex/skills/cc-openspec/SKILL.md:219`) contradice el modo Loop Agent (3 iteraciones) de `.claude/CLAUDE.md:768-771`, y "record findings in state" es imposible: el esquema de estado no tiene campo de hallazgos (`src/validation/schemas.ts:847-855`).
7. **FIFO no se garantiza:** `selectNextItem` ordena por prioridad e incluye ítems en curso (`backlog-planner.ts:197-203`); `plan` reemplaza las tarjetas de otros ítems (`openspec.command.ts:435-446`); `start` no valida `dependsOn` (`openspec.command.ts:822-834`).
8. Ruido adicional (H7-H12): heurística léxica del analizador solo en inglés, `--input <planner.json>` mal documentado, schema del planner no comunicado, `rdd capture` en toda fase, `scorecard record` sin validación, matriz de modelos desalineada.

## Regla de invocación propuesta

| Contexto | Comando |
| --- | --- |
| Proyecto consumidor (todo skill/preset/hook/plantilla generada) | `npx cc-codeconductor <args>` |
| Este repo, desarrollo del propio CLI (`CLAUDE.md:95`, `AGENTS.md:85`) | `bun run dev <args>` |

`resolveCliBin()` ya implementa esta idea (`src/utils/cli-bin.ts:16-60`) pero solo la usan `command-registry.ts:2`, `usage-guide.ts:1` y `onboarding.command.ts:6`; skills, hook y plantillas hardcodean el texto.

---

## Hallazgos

Formato: **{severidad | tipo}** — evidencia → causa raíz.

### H1 — `Bun.spawn` en el bin publicado (node) rompe `next` y la captura TDD  **{P0 | bug-CLI}**

- `package.json:49` (`build:cli`: `bun build … --target=node`); `dist/index.js:1` (`#!/usr/bin/env node`); `dist/index.js:22381` y `dist/library.js` (2 ocurrencias de `Bun.spawn`).
- `src/core/compilation/compile-checker.ts:291-293` (`Bun.spawn(parts, …)` dentro de `try`), `:294-305` (el `catch` devuelve `exitCode:-1`, `stderr: "ReferenceError: Bun is not defined"`, `errors: []`). Único uso de `Bun.` en `src/` (la búsqueda `Bun\.` solo devuelve ese archivo).
- `src/core/loop/loop-engine.ts:460-479`: con `errors: []` y `success:false` se sintetiza un error `COMPILE` "Compile check failed (exit -1)", el bucle escala (3 iteraciones sin fixer) y `LoopResult.compileCheck = 'ran'` (`:209`).
- `openspec.command.ts:762-770`: `code: loop && !loop.success ? 1 : 0` → exit 1 con `"compileCheck": "ran"`, idéntico al log tras `done BC-012-design`.
- Default que lo activa en cualquier consumidor: `src/core/config/codeconductor-config.ts:68-72` (`compileCheck.enabled: true`, `command: 'tsc --noEmit'`).
- Mismo defecto en `captureTddSuiteEvidence`, que llama `runCompileCheck` (`src/core/verification/verification-runner.ts:445-448`) → `done` de `test`/`implement` es inalcanzable bajo node. El log lo rodeó ejecutando `bun …/dist/index.js` y `bun /tmp/adpilot-bc012-green.ts`.
- **Por qué no lo detecta ningún test:** los tests corren con `bun test`; el único test bajo node es `test/ccep/node-runtime-compat.test.ts:25-49` y solo cubre `ccep parse` (regresión previa por `import.meta.dir`, misma clase de bug). `test/compile-checker.test.ts:261-262` usa `Bun.sleep`/`Bun.file`.
- Reproducción en ejecución: **no realizada** (límite de permisos); la cadena anterior es determinista por lectura.

### H2 — Artefactos para consumidores prescriben `bun run dev`  **{P0 | bug-skill}**

- `src/commands/hook.command.ts:78-84`: el hook SessionStart imprime `run: bun run dev openspec status`, `bun run dev scorecard models`, etc. En el log, el agente siguió esa pista y obtuvo `Script not found "dev"`.
- Skill `openspec` (fuente y 6 presets): `skills/openspec/SKILL.md:27` ("Local CLI is `bun run dev`") y `:114`. Idem `testing-tdd` (`:32`, `:53`), `evaluation` (`:28`), `backlog` (`presets/*/skills/backlog/SKILL.md:32`).
- Comandos `/cc-*`: `presets/*/commands/**` y `presets/codex/skills/cc-*/SKILL.md` repiten "Local development: `bun run dev <same argv>`" (`scripts/inject-ccep-bootstrap.ts:84`), además de `cc-ask`/`cc-odd` con `bun run dev ask …` (`presets/claude/commands/cc/ask.md:21`, `odd.md:10-11`).
- Instrucciones de agente: "Receipt integrity … `bun run dev rdd`" se copia a consumidores (`presets/codex/AGENTS.md:1089`, `presets/claude/CLAUDE.md:807`, `presets/gemini/GEMINI.md`, `presets/{cursor,agy,pi,muse}/AGENTS.md`).
- `src/core/evaluation/harness-experiment.ts:108,109,131` genera comandos `bun run dev …` en sus salidas.
- Mezcla en el mismo archivo: `presets/codex/skills/cc-openspec/SKILL.md:52-69` usa `npx cc-codeconductor` y a la vez `:69` "Local development: `bun run dev`" → el agente no tiene regla de desempate.
- Inventario completo en la sección siguiente.

### H3 — `done` sobrescribe `tasks.md`; nadie marca la completitud  **{P0 | bug-CLI}**

- `openspec.command.ts:906-912` (`handleDone`) y `:1009-1015` (`unblock`) llaman `writeTasksMarkdown`, que reescribe todo el archivo desde plantilla (`src/core/openspec/openspec-generator.ts:111-123`, `tasksContent` `:125-170`).
- La plantilla solo marca `[x]` en la sección "Phase cards" de tarjetas `test`/`implement` hechas (`:158-163`). Las líneas `Write failing test for FR-…`, `Implement FR-…`, `Verify SC-…` (`:151-154`), `Setup`, `Foundational`, `Polish` salen siempre `- [ ]`.
- Consecuencia: la trazabilidad FR→test que el agente reparó a mano para pasar `analyze` (log, 2.ª sesión) y los items añadidos (p. ej. verificar 375px/1280px, capturar RDD) se pierden en el siguiente `done` **(inferido: consistente con que el implementador terminara con `cp /tmp/adpilot-bc012-tasks.md …/tasks.md`)**. `openspec.command.ts:906` está testeado como comportamiento esperado: `test/unit/commands/openspec-lifecycle.test.ts:71,104-107` ("regenerate tasks.md"), sin comprobar que se preserven ediciones.
- El skill delega el marcado al agente ("The implementer ticks `tasks.md` boxes", `presets/codex/skills/cc-openspec/SKILL.md:194-196`; `skills/openspec/SKILL.md:43-45`), pero el CLI lo pisa.
- Criterios de aceptación de `BACKLOG.md`: `parseAcceptanceLines` acepta `- [ ]`/`- [x]` (`backlog-parser.ts:46-49`); `updateBacklogItemInMarkdown` solo reescribe `Status`/`Progress` (`openspec-state.ts:182-187`) y `archiveItemInMarkdown` fuerza `Status: DONE`/`Progress: 100%` (`:212-216`). Ningún código convierte los criterios a `[x]` al archivar.
- `archive` con casillas pendientes solo avisa (`openspec.command.ts:1092-1096`; `test/openspec/opsx-flow.test.ts:310`); `verify` las marca `WARNING` (`:634-643`) y `archiveReady` las ignora (`:656-661`). La completitud no es un gate.
- Aparte: `generateOpenspecChange` reescribe `proposal.md`, `design.md`, `tasks.md` y spec en cada `plan` (`openspec-generator.ts:189-199`); `plan` sobre un ítem `PLANNED` está permitido (`openspec.command.ts:423-427`) y `buildNextSteps` recomienda "re-run openspec plan" si falta un artefacto (`:244-247`) → riesgo de perder el `design.md` refinado por el architect.

### H4 — `next` ejecuta un bucle de compilación sin generador y su mensaje engaña  **{P1 | bug-CLI}**

- `openspec.command.ts:755-759`: `shouldRunAgentLoop` (`loop-engine.ts:399-407`) es verdadero para `phase test|implement` → `runLoopForProject`, cuyo `generateFn` es `async () => ({ tokenUsage: 0 })` (`loop-engine.ts:483`). Es decir, `next` (una consulta) ejecuta `tsc --noEmit` hasta 3 veces sin ningún fixer. Cualquier error de tipos preexistente en el repo consumidor (en el log: `CampaignEditor.test.ts` falla `astro check` también en HEAD) devuelve exit 1 aunque la tarjeta sea válida **(inferido)**.
- `next` devuelve `taskCard: null` + "No pending task cards. Run openspec plan first." también cuando hay una tarjeta `doing` (`openspec.command.ts:742-751`; `getNextTaskCard` solo devuelve `pending`, `openspec-state.ts:132-140`; comportamiento fijado en `openspec-lifecycle.test.ts:86-87`). Tras `start BC-012-test` el agente leyó "run plan first" aunque el plan existía.
- Sobre el estado tras `done BC-012-discover` (`itemStatus: IN_PROGRESS`, `allCardsDone:false`): **es correcto**. El ítem pasa a `REVIEW` solo cuando las 5 tarjetas están `done` (`openspec.command.ts:901,914`); no es un bug.

### H5 — El flujo canónico no está modelado (verify, archive, loop)  **{P1 | bug-CLI + bug-skill}**

- Fases disponibles: `discover|design|test|implement|review` (`src/validation/schemas.ts:823-829`; `backlog-planner.ts:11-25`; `agent-router.ts:8-14`). Perfil CCEP: `validate-backlog, discover, design, analyze, test, implement, review` (`src/core/ccep/workflows/openspec.yml:5-32`, idéntico a `.codeconductor/workflows/openspec.yml`). Ver tabla más abajo.
- No hay subcomando para rechazo del reviewer ni reapertura: el estado permite `REVIEW→IN_PROGRESS` (`openspec-state.ts:22`) pero ningún handler lo ejecuta; `start` exige tarjeta `pending|doing` (`openspec.command.ts:822-824`) y `done` es idempotente sobre `done` (`:873-878`). Tras una tarjeta `implement`/`test` `done` no hay forma de volver a abrirla en el CLI.
- Semántica de `REVIEW` ambigua: el ítem entra en `REVIEW` cuando **termina** la tarjeta `review` (`:901,914`), mientras el skill describe "Reviewer rejection: REVIEW → IN_PROGRESS" (`skills/openspec/SKILL.md:60-61`).
- `done` de la tarjeta `review` no exige veredicto (solo exige evidencia para `test`/`implement`, `:887-895`); el veredicto se exige recién en `archive` (`:1059-1072`).
- "Loop" solo existe como bucle de compilación (H4), no como bucle fix→test→re-review.

### H6 — FIFO no garantizado  **{P1 | bug-CLI}**

- `selectNextItem` (`backlog-planner.ts:189-214`): ordena por prioridad (`comparePriority`, `:181-184`), no por orden de archivo (el orden estable solo desempata) y considera `READY|PLANNED|IN_PROGRESS` (`:201`). Un P0 `READY` posterior desplaza a un P1 `IN_PROGRESS`; `status` informa `nextItemId` sin tener en cuenta `activeItemId` (`openspec.command.ts:700,715-716`).
- `handlePlan` construye `taskCards` solo con las del ítem planificado (`:429-435`) y las persiste en lugar de las existentes (`:446`) y cambia `activeItemId` (`:445`): planificar B borra las tarjetas de A en curso; luego `archive A` falla con "No task cards found" (`:1049-1051`).
- `handleStart` no verifica `card.dependsOn` (`:807-856`): se puede `start BC-012-implement` antes de `test`. Solo `next` respeta dependencias (`openspec-state.ts:136`).
- `plan <BC-id>` explícito salta el orden (`backlog-planner.ts:199`) — es por diseño, pero el skill no distingue FIFO de selección manual.

### H7 — El analizador de trazabilidad es léxico y solo inglés  **{P1 | bug-CLI / bug-skill}**

- `src/core/openspec/spec-analyzer.ts:56-65`: una línea cuenta como "tarea de test" si coincide `/\btest\b|TDD|RED|suite/i`. Sintaxis exacta que satisface FR-00N: una línea de `tasks.md` que contenga el literal `FR-00N` **y** una de esas palabras (`:87`, `:99-107` → `TDD_FR_UNTESTED` CRITICAL → `stop:true`).
- Efectos: (a) tareas en español ("Escribir prueba fallida para FR-002") no cuentan → `analyze stop:true`, que es el bloqueo del log ("el analizador todavía no reconoce los tests de FR-002"); (b) falsos positivos: `RED` sin `\b` e insensible a mayúsculas coincide dentro de "requi**red**", "registe**red**".
- La plantilla sí cumple (`openspec-generator.ts:151` "Write failing test for FR-…"), pero el skill no documenta la sintaxis (`presets/codex/skills/cc-openspec/SKILL.md:131-135` pide "traza a FR/SC" sin formato). Tampoco `spec-quality` documenta que exige `MUST/SHALL` y GWT en inglés (`spec-quality.ts:5,93-102`).
- Test que fija el comportamiento: `test/openspec/spec-analyze.test.ts:25-58`; no hay caso en español ni falso positivo.

### H8 — `ccep evaluate` en el flujo OpenSpec: sintaxis y esquema no comunicados  **{P1 | bug-skill}**

- Texto inyectado: `--input <planner.json>` (`scripts/inject-ccep-bootstrap.ts:66`; `presets/codex/skills/cc-openspec/SKILL.md:54`). Implementación: `--input` acepta JSON inline o `@ruta` **relativa dentro del proyecto** (`src/commands/ccep.command.ts:99-138`; `docs/ccep-1.md:83,130`). Una ruta absoluta (`/tmp/x.json`) no empieza por `@` → `JSON.parse("/tmp/…")` → "Unexpected token '/'" (log). No hay flag `--file`; la ayuda no explica `@`.
- El schema exige `risks: {type,description,severity}[]` y `tasks: {id,title,priority,estimate,dependencies}[]` (`src/validation/schemas.ts:1010-1031`) pero el prompt del planner muestra `"risks": [], "tasks": []` sin forma (`presets/opencode/prompts/v1.0.0/planner.md:46-57`) → el agente emitió strings (log: "expected object, received string").
- El prompt manda `needsConfirmation: true` si el riesgo es medio/alto o hay dudas (`planner.md:68-70`) y el gate detiene con `needsConfirmation` (`confirmation-gate.ts:35-37`) → "stop" por diseño aun sin hallazgos.
- Para OpenSpec el paso es vestigial: las tarjetas salen de `openspec plan`, no de un planner; el workflow ni tiene fase planner (`openspec.yml:5-32`). El agente fabricó `/tmp/adpilot-bc012-planner.json` solo para cumplir el Step 0.3 y gastó dos iteraciones.

### H9 — Evidencia TDD vs recibo RDD; captura sin CLI  **{P1 | bug-CLI + uso}**

- `captureTddSuiteEvidence` es solo API de librería (`src/index.ts:41`; ningún subcomando en `src/commands/`; el único consumidor es el mensaje de error `openspec.command.ts:892`). Los skills lo nombran como si fuera comando (`skills/openspec/SKILL.md:43`).
- `rdd verify --receipt ev-tdd-…` → "is not an RDD receipt" es **correcto**: la evidencia TDD es `type:'tdd'` (`verification-runner.ts:474`) y `rdd.command.ts:39` solo acepta `type:'rdd'`. El skill dice "RDD-backed RED or GREEN receipt" (`presets/codex/skills/cc-openspec/SKILL.md:155-157`), lo que invita a la confusión.
- `done` exige evidencia `tdd` cuyo `suiteFailed` (RED) / `suitePassed` (GREEN) coincida (`verification-runner.ts:582-600`; `openspec.command.ts:887-895`). `test/openspec/tdd-evidence-done.test.ts:63` lo cubre con evidencia sembrada, no con captura real.

### H10 — `rdd capture` en toda fase ensucia git  **{P2 | uso + bug-skill}**

- `.claude/CLAUDE.md:805-808` (copiado a presets, ver H2) manda capturar RDD "para cualquier implementación, test, review, handoff o entrega". El agente capturó con `--phase review` en `discover` y `design` (log) y quedaron `.codeconductor/evidence/ev-rdd-*.json` y `.codeconductor/rdd-receipts/*.json` sin seguimiento.
- `ensureOpenspecGitignore` solo ignora `BACKLOG.md`, `openspec/` y `.codeconductor/openspec-state.json` (`src/core/openspec/openspec-gitignore.ts:9-13`); evidencia, recibos y `evaluation/` quedan fuera.
- `rdd capture` sin `--outcome` registra `passed` sin ejecutar nada (`src/commands/rdd.command.ts:126`): es una huella de hashes, no una verificación.

### H11 — `scorecard record` sin validación y gate autoatestable  **{P2 | bug-CLI}**

- `handleRecord` acepta sin `--task`/`--verdict` y escribe un outcome `unknown-task` (`src/commands/scorecard.command.ts:258-318`); en el log escribió en `.codeconductor/evaluation/{index.json,outcomes.jsonl}` y el agente hizo `git restore`.
- `hasPassingScorecard` acepta cualquier outcome `source:'review'` con `verdict:'PASS'` para el backlog id (`outcome-store.ts:153-162`): el implementador puede satisfacer el gate de `archive` sin revisor real.

### H12 — Matriz de modelos desalineada con el preset  **{P2 | bug-skill}**

- El comando codex impone "GPT-6.1 Sol with medium reasoning effort" (`presets/codex/skills/cc-openspec/SKILL.md:12`; generado en `scripts/render-agent-commands.ts:128`) mientras `scorecard models` resuelve por `defaults.target` del config del proyecto (por defecto `opencode`) (`scorecard.command.ts:366-379`). El agente lo notó y siguió el skill (log).
- Además "Use the model configured in the installed preset" (`cc-openspec/SKILL.md:185`) contradice `:12`.

### H13 — Plantillas generadas genéricas  **{P2 | bug-CLI}**

- Spec delta: `Scenario` fijo "GIVEN the relevant scoped behavior / WHEN this change is applied / THEN <criterio>" y `The system MUST <criterio>` (`openspec-generator.ts:83-95`) → escenarios no accionables y gramática rota con criterios no imperativos (en español).
- `tasks.md`: `Confirm scope…`, `Read existing conventions…`, `Polish: Run openspec analyze and scorecard create --from-diff` (`:135,139,168`) son casillas que nadie marca (H3). El checklist `bun run dev scorecard suite-run …` está en la sección Verification del skill (`skills/openspec/SKILL.md:114`), no en `tasks.md`.

### H14 — Inconsistencias de texto del skill  **{P2 | bug-skill}**

- `presets/codex/skills/cc-openspec/SKILL.md:221`: "If approved: proceed to Step 6", pero el paso siguiente es Step 7 (`:225`); en `presets/claude/commands/cc/openspec.md:235-239` el siguiente es "Step 6". Tres variantes de numeración (claude/cursor/codex).
- Step 3 dice "FIFO by priority" (`:110`): ambiguo (ver H6).
- Las variantes compactas (`presets/opencode/commands/cc-openspec.md:105`, `presets/agy/workflows/cc-openspec.md:104`, `.pi/prompts/cc-openspec.md:105`, `.agents/workflows/cc-openspec.md:104`) dicen solo "Reject → IN_PROGRESS, STOP".

---

## Regla "If rejected … STOP" y Loop Agent (pregunta 5)

**Texto exacto (idéntico en claude/cursor/gemini/codex):**
`If **rejected**: set item status `IN_PROGRESS`, record findings in state, **STOP** and report to user.` → `presets/claude/commands/cc/openspec.md:233`, `presets/cursor/commands/cc/openspec.md:210`, `presets/gemini/commands/cc/openspec.toml:207`, `presets/codex/skills/cc-openspec/SKILL.md:219` (y copias `.cursor`, `.gemini`). Variante corta: `Reject → IN_PROGRESS, STOP.` en opencode/agy/pi/.agents (H14).

**Contraste:** `.claude/CLAUDE.md:768-771` (y copias en `presets/{claude,codex,cursor,agy}`): "If tests or verifications fail, do not stop… up to 3 self-correction iterations… then escalate". El skill no referencia ese modo para el hallazgo del Reviewer, y además pide algo irrealizable ("record findings in state": `OpenspecStateSchema` no tiene campo de hallazgos, `schemas.ts:847-855`; tampoco subcomando, y se prohíbe editar el JSON a mano, `cc-openspec/SKILL.md:142`).

**Caso de estudio (BC-012):** el Reviewer halló que `0,23 / 0,40` devuelve 0,57 en vez de 0,58. Verificado: en coma flotante `0.23/0.40 = 0.575` pero `Math.round(0.575*100)/100 = 0.57` (`x*100 = 57.49999…`), mientras `Math.round(23*100/40)/100 = 0.58`. Es un defecto determinista, dentro del alcance del ítem y con arreglo evidente (aritmética en céntimos enteros, ya usada en el resto del módulo según el log) → **hallazgo corregible**, no bloqueo. El agente se detuvo y preguntó "¿Continúo corrigiendo el redondeo…?" por la regla literal.

**Redacción propuesta para el Step "Review gate"** (sustituir el párrafo "If rejected…"):

```text
If the reviewer verdict is `approved`: go to the next step.

If the reviewer returns findings:
1. Classify each finding.
   - FIXABLE: a deterministic defect inside the item's scope (CRITICAL/WARNING on
     correctness, tests, scope, simplicity, formatting). Needs no new requirement,
     permission, or scope decision.
   - BLOCKING: missing authorization, ambiguous or conflicting requirements (needs a
     product decision), risk level raised to high, a change outside the item's scope,
     or a security finding with veto.
2. If every finding is FIXABLE, run the correction loop WITHOUT asking the user:
   a. `npx cc-codeconductor openspec reopen <cardId> --reason "<finding id>"` for the
      affected implement/test cards (tests first for a missing regression case).
   b. tester adds a failing regression test (RED evidence), implementer fixes (GREEN
      evidence), then re-run only the affected verifications and the reviewer on the diff.
   c. Maximum 3 iterations per item. Count an iteration per reviewer round.
3. Escalate to the user (STOP) only when: any finding is BLOCKING; the same finding
   repeats after 2 iterations; or 3 iterations are exhausted. The report lists
   findings, iterations, evidence ids, and the exact decision needed.
Never ask "should I continue fixing?" for a FIXABLE finding.
```

Requiere el subcomando `openspec reopen` (propuesta P1-3). Si un criterio de redondeo no está en la spec (p. ej. half-up vs. otro), se trata como BLOCKING solo si el reglamento del ítem no lo define; de lo contrario, FIXABLE y se documenta en `design.md`.

---

## Mapa: flujo deseado vs implementado

| Fase deseada | Implementación actual | Gate | Brecha |
| --- | --- | --- | --- |
| explore | tarjeta `discover` (`repo-explorer`, solo lectura) | `done` sin evidencia | Sin salida verificable; el skill pide solo "Repo map" |
| propose | `openspec plan` genera proposal/design/tasks/spec (`openspec-generator.ts:175-202`); tarjeta `design` (architect) | `validate`, `analyze` (`stop` por CRITICAL) | `plan` es plantilla genérica (H13); re-`plan` sobrescribe (H3); revisión del plan solo en texto del skill |
| tdd | tarjeta `test` (`tester`) → evidencia RED | `done` exige RED del runner (`openspec.command.ts:887-895`) | Captura solo vía librería y rota bajo node (H1, H9) |
| implement | tarjeta `implement` → evidencia GREEN | `done` exige GREEN | Idem; `tasks.md` pisado en `done` (H3) |
| verify | `openspec verify` (advisory, siempre exit 0, `:663-665`) | Ninguno vinculante; `archiveReady` ignora casillas | No es tarjeta ni gate; no marca completitud |
| review | tarjeta `review` (`reviewer`) + `scorecard regression` | `done` sin veredicto; `archive` exige scorecard PASS (`:1059-1072`) | Veredicto autoatestable (H11); sin rechazo/reapertura (H5) |
| archive | `openspec archive` (`:1034-1141`) + mover a `## Archive` | Todas las tarjetas `done`, review card `done`, scorecard PASS, sin CRITICAL | No marca criterios en BACKLOG ni `tasks.md`; solo avisa de casillas (H3) |
| loop | bucle compile-fix en `next` (`:755`) | — | Bucle sin generador (H4); sin bucle fix→test→re-review (H5) |
| FIFO | `selectNextItem` por prioridad | — | H6 |

## Cobertura de tests existentes (pregunta 6)

| Archivo | Cubre |
| --- | --- |
| `test/unit/commands/openspec-lifecycle.test.ts` | `start/done/next` (incluye `next`=null con tarjeta `doing` y regeneración de `tasks.md`, `:71-114`), `plan` no rebobina `IN_PROGRESS` (`:116`), `block/unblock`, `archive` end-to-end con evidencia sembrada y scorecard `saveScorecard` (`:171-219`) |
| `test/openspec/opsx-flow.test.ts` | `status` (artefactos/casillas/nextSteps), `sync`, `verify` advisory, guardas de `archive` (artefacto faltante, CRITICAL, aviso de casillas `:310`, no sobrescribir `:325`) |
| `test/openspec/tdd-evidence-done.test.ts`, `archive-scorecard-gate.test.ts` | `done` rechaza evidencia manual; `archive` sin scorecard PASS falla |
| `test/openspec/spec-analyze.test.ts`, `spec-quality.test.ts`, `artifact-progress.test.ts` | cobertura FR/SC (inglés), conteo `[x]/[X]` |
| `test/unit/core/openspec/*` | parser, planner (reset por drift/orden TDD), validator, generator, gitignore |
| `test/ccep/node-runtime-compat.test.ts` | Únicamente `ccep parse` bajo `node dist/index.js` |

**Huecos:** (1) ningún test ejecuta `openspec next/done` ni captura TDD bajo node contra `dist/` (H1); (2) no hay test de que `done` preserve ediciones de `tasks.md` (el existente exige lo contrario, H3); (3) no hay e2e `plan→…→archive` con marcado de casillas/criterios; (4) sin tests de FIFO (prioridad vs orden, `plan` de un segundo ítem con otro en curso, `start` con dependencias abiertas); (5) sin test del bucle de rechazo/re-review ni de `reopen` (no existe); (6) analizador sin casos en español ni falso positivo `RED`; (7) `captureTddSuiteEvidence` se prueba con `bun` y comando allowlisted, no vía CLI; (8) nada comprueba que los presets/hook no emitan `bun run dev` a consumidores (`test/unit/cli/cli-bin.test.ts` cubre solo `resolveCliBin`).

## Inventario de invocaciones `bun run dev` a corregir

Total: **182 archivos** con la cadena (`git grep -l`, excluidos `docs/generated`, `graphify-out`, `openspec/changes`).

**A. Código fuente que emite el texto a consumidores (corregir primero)**
- `src/commands/hook.command.ts:78,81,82,83,84`
- `src/core/evaluation/harness-experiment.ts:108,109,131`
- `scripts/inject-ccep-bootstrap.ts:84` (genera la línea "Local development" en todos los `/cc-*`)
- `scripts/render-agent-commands.ts` (plantillas Codex; comprobar texto derivado)
- `src/presets/targets/pi.yml:5` (comentario)

**B. Skills fuente**
- `skills/openspec/SKILL.md:27,114`; `skills/testing-tdd/SKILL.md:32,53`; `skills/evaluation/SKILL.md:28`; `skills/cc-update-preset-models/SKILL.md`, `skills/cc-self-review/**` (8 archivos; decidir si son solo de mantenedores)

**C. Presets (89 archivos)**
- `presets/{claude,cursor,gemini,opencode,agy}/commands|workflows/**` (10 comandos × 5 targets; línea "Local development")
- `presets/codex/skills/cc-*/SKILL.md`, `presets/codex/commands/cc-ask.md`, `presets/codex/skills/{openspec,testing-tdd,evaluation,backlog}/SKILL.md` y los mismos 4 skills en `claude`, `cursor`, `agy`, `opencode`
- `presets/claude/commands/cc/{ask,odd,tdd-cycle}.md` (`bun run dev ask`, `bun run dev ccep …`, `:292` suite-run)
- `presets/*/AGENTS.md`, `presets/claude/CLAUDE.md:807`, `presets/gemini/GEMINI.md`, `presets/{pi,muse,codex}/AGENTS.md`
- `presets/opencode/agents/implementer.md`, `presets/opencode/prompts/v1.0.0/implementer.md`, `.gemini/prompts/v1.0.0/implementer.md`

**D. Copias instaladas en este repo (se regeneran desde presets)**
- `.agents/` (17), `.cursor/` (17), `.gemini/` (16), `.pi/` (10), `.claude/CLAUDE.md`

**E. Mantenedores — conservar `bun run dev` (documentar como "solo este repo")**
- `CLAUDE.md:95-102`, `AGENTS.md:75-92`, `GEMINI.md`, `Makefile`, `README.md:21,174,194-199`, `USAGE.md` (12), `docs/usage-cc.md` (72), `docs/cc-commands.md` (9), `docs/hooks.md:18-20`, `docs/agent-scorecard.md` (7), `docs/usage-cli.md`, `docs/odd-adoption.md`, tests (`test/unit/cli/cli-bin.test.ts`, `usage-guide.test.ts`, `target-capabilities.test.ts`)
- Atención: `AGENTS.md:75` ("Receipt integrity … `bun run dev rdd`") pertenece a E pero se copia a C; separar el bloque para consumidores.

---

## Propuesta de cambios (sin implementar)

### P0

**P0-1. Eliminar la dependencia de `Bun` en runtime publicado** (`compile-checker.ts:293,343`).
Criterios: (a) `grep -c "Bun\." dist/index.js dist/library.js` = 0; (b) nuevo test bajo `node dist/index.js` que, en un proyecto temporal con `compileCheck.command` válido, hace `openspec next` de una tarjeta `test` y devuelve `code 0` con `compileCheck:"ran"`; (c) `captureTddSuiteEvidence` ejecutada bajo node devuelve `evidenceId`.

**P0-2. `next` y `status` solo leen estado.** Mover el bucle compile-fix fuera de `handleNext` (a `done` de `implement` o a un `verify`).
Criterios: `next` devuelve exit 0 con una tarjeta pendiente aunque `tsc --noEmit` falle; si hay una tarjeta `doing`, el mensaje la nombra ("BC-012-test está en curso: ejecuta `openspec done BC-012-test`") en lugar de "run plan first".

**P0-3. `done` no sobrescribe `tasks.md`.** Solo cambia la casilla de la línea `(<cardId>)`; añadir el marcado de FR/SC y de criterios de aceptación (p. ej. `openspec check <FR-00N|SC-00N|AC#> [--evidence <id>]`) y que `done` de `implement` falle (o avise de forma vinculante, configurable) si quedan FR sin marcar.
Criterios: test que edita `tasks.md`, ejecuta `done` y el contenido añadido/ticks sobreviven; test e2e `plan→…→archive` donde `tasks.md` y los `Acceptance` de `BACKLOG.md` terminan en `[x]` y el ítem queda en `## Archive`; `archive` falla si hay casillas pendientes (con `--allow-unchecked` explícito).

**P0-4. Una sola regla de invocación para consumidores.** Plantillas con marcador (`{{CLI}}`) renderizado al instalar con `resolveCliBin()` (`npx cc-codeconductor` por defecto) y el hook usando `resolveCliBin()`.
Criterios: `git grep "bun run dev" -- presets src skills scripts ':!…allowlist-mantenedores'` = 0; `hook session-start` bajo `npx` imprime `npx cc-codeconductor …`; test de deriva que falla si un preset contiene `bun run dev`; `docs/usage-cc.md`/`USAGE.md`/`CLAUDE.md`/`AGENTS.md` dejan claro "solo este repo".

**P0-5. Subcomando CLI para evidencia TDD** (p. ej. `tdd capture --task <cardId> --phase red|green --command "<allowlisted>"`), documentado en skills en lugar de "captureTddSuiteEvidence".
Criterios: bajo node en proyecto temporal, `capture --phase red` con suite que falla permite `openspec done <test-card>`; `--phase green` con suite verde permite `done <implement-card>`; `rdd verify` y el skill explican la diferencia `ev-tdd-*` vs `ev-rdd-*`.

### P1

**P1-1. Modelar la reapertura y el bucle de review.** `openspec reopen <cardId> --reason`, `openspec review --verdict approved|changes-requested --finding …` persistiendo hallazgos en el estado (campo nuevo en `OpenspecStateSchema`), límite de 3 iteraciones.
Criterios: caso BC-012 reproducible en test (hallazgo → reopen implement → RED/GREEN nuevo → review aprobado → archive); tras 3 rondas el CLI devuelve `escalate` con el informe; `done` de la tarjeta `review` exige veredicto registrado.

**P1-2. Reescribir "Review gate" en todos los targets** con la redacción de la sección anterior, y alinear con "Loop Agent Mode".
Criterios: `git grep "STOP\*\* and report to user" -- presets .agents .cursor .gemini .pi` = 0 para openspec; los 7 targets contienen la clasificación FIXABLE/BLOCKING; la numeración de pasos es coherente (H14).

**P1-3. FIFO real.** `selectNextItem`: orden de archivo (FIFO) dentro de la prioridad (o solo FIFO, según decisión), y un ítem `PLANNED|IN_PROGRESS|REVIEW` bloquea la selección de otros; `plan` conserva tarjetas de otros ítems; `start` valida `dependsOn`.
Criterios: tests con A (P1, en curso) y B (P0, READY): `status.nextItemId` = A; `plan B` mantiene las tarjetas de A (o falla con mensaje); `start BC-x-implement` con `test` pendiente falla.

**P1-4. Analizador de trazabilidad robusto.** Reconocer un marcador explícito (`[test]`, `Test:` o `FR-001 → test: <ruta>`) además de sinónimos configurables (`prueba`, `test`), `\b` en `RED`; documentar la sintaxis en la plantilla y en el skill; mensaje del hallazgo con la línea esperada.
Criterios: casos de test con español y con "required" (no cuenta); `TDD_FR_UNTESTED` incluye un ejemplo de línea válida.

**P1-5. `ccep evaluate`/planner.** Documentar `@ruta-relativa` en el texto inyectado (`<planner.json>` → `@<ruta relativa al proyecto>`), añadir `--file`, mensaje de error que sugiera `@`, incluir el shape de `risks`/`tasks` en el prompt del planner, y quitar el paso de planner del flujo OpenSpec (el perfil no tiene fase planner).
Criterios: `ccep evaluate --input /tmp/x.json` devuelve error con pista de `@`; el prompt del planner contiene un ejemplo que valida con `PlannerOutputSchema`; el skill de openspec no exige `evaluate` salvo con `[NEEDS CLARIFICATION]`.

**P1-6. `re-plan` no destructivo.** `generateOpenspecChange` no sobrescribe `design.md`/`tasks.md` existentes (o requiere `--force`); `buildNextSteps` ya no recomienda re-plan.
Criterios: test: editar `design.md`, `plan` de nuevo → contenido preservado.

### P2

**P2-1.** Política de RDD: capturar solo en los gates (RED, GREEN, review final) y no en `discover/design`; añadir `.codeconductor/evidence/`, `.codeconductor/rdd-receipts/` y `.codeconductor/evaluation/` a `ensureOpenspecGitignore` o documentar qué versionar. Criterio: tras un ciclo completo, `git status` solo muestra archivos del ítem.
**P2-2.** `scorecard record`: exigir `--task` y `--verdict`; `hasPassingScorecard` solo acepta el outcome creado por el flujo de review (no `source:'review'` manual). Criterio: `scorecard record` sin args falla; `archive` sin review real falla.
**P2-3.** `scorecard models` debe resolver el target desde el preset instalado (o el skill debe omitir el modelo concreto). Criterio: en un proyecto con preset codex, `models` y `cc-openspec` coinciden.
**P2-4.** Plantillas: escenarios derivados del criterio (pasar GIVEN/WHEN/THEN desde el backlog si existen), idioma configurable; eliminar casillas que nadie marca. Criterio: `plan` de un ítem con criterios en formato GWT no produce texto genérico.

---

## Preguntas abiertas para el usuario

1. **Alcance de "siempre `npx`":** ¿incluye el desarrollo en este repo? `CLAUDE.md:95` dice `bun run dev` "antes de publicar v1.0.0", pero el paquete ya está en 1.6.1. Propongo: `npx` en todo lo que ven los consumidores; `bun run dev` solo para tests del propio CLI. ¿Confirmas?
2. **Versionado de `npx`:** sin instalación local, cada sesión puede fallar offline (`EAI_AGAIN`, log). ¿Prefieres documentar `npm i -D cc-codeconductor` + `npx --no-install cc-codeconductor`, o fijar versión (`npx cc-codeconductor@1.6.x`)?
3. **FIFO:** ¿estricto por orden de archivo, o por prioridad (P0→P3) con FIFO como desempate? Hoy es lo segundo y "el ítem en curso no bloquea".
4. **Completitud:** ¿`archive` debe fallar con casillas de `tasks.md`/criterios de aceptación sin marcar (recomendado) o seguir solo avisando? ¿Quién marca (agente con `openspec check` o el CLI al registrar evidencia)?
5. **Tope del bucle de review:** ¿3 iteraciones por ítem (como Loop Agent) o por hallazgo? ¿Un hallazgo de "regla de redondeo no definida" cuenta como BLOCKING?
6. **Idioma de specs:** el analizador/spec-quality exigen palabras en inglés (`MUST`, `Given/When/Then`, `test`). ¿Se soportan specs en español como ciudadano de primera?
7. **Estado de `bun` en consumidores:** ¿es aceptable exigir Bun en el consumidor para evidencia TDD (hoy de facto), o debe funcionar solo con Node (P0-1/P0-5)?

## Límites de esta investigación

- No se ejecutó el CLI ni se reprodujo H1 en tiempo de ejecución (denegado por permisos); la cadena `Bun.spawn → ReferenceError → exitCode -1 → exit 1` se dedujo del código y coincide con el log. Los puntos marcados **(inferido)** deben confirmarse al implementar (p. ej. la sobrescritura de `tasks.md` por `done` frente a la copia manual del log).
- El log de Codex es la única evidencia del comportamiento en `adpilot`; no se tuvo acceso al repo consumidor (su `config.yml`, versión exacta de la caché `_npx`).
- `dist/` del repo es del 3-oct y puede no coincidir con 1.6.1 publicado; el bin publicado se asume equivalente por el log (`Bun is not defined`).
