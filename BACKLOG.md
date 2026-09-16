# BACKLOG

Backlog de integración de las skills de `mattpocock/skills` en CodeConductor.
Formato validable por `cc openspec validate`. Análisis completo en
[`NEW_SKILLS.md`](./NEW_SKILLS.md).

## Global

- Product: CodeConductor — Multi-Agent Orchestration Framework
- Strategy: Portar selectivamente la mecánica de mattpocock/skills que refuerce el flujo de slash commands y la validación por código (comandos CLI y hooks), sin añadir dependencias externas.
- Policy: Stdlib-first, YAGNI y cambios quirúrgicos; cada item se valida con `cc openspec validate` y se cierra con `cc scorecard`.
- Review required: yes
- TDD required: yes

## Items

### BC-022 | Ensamblado de contexto y reanudación con presupuesto observable

- Priority: P1
- Status: PLANNED
- Type: feature
- Depends on: BC-021
- Description: Reducir repetición entre agentes montando contexto mínimo desde ledger, scope, memoria y evidencia, y reusar compacción posterior a TDD.
- Scope: contexto/compacción/memoria, compilación CCEP, contratos de handoff y tests de límites/reanudación.
- Out of scope: Inyectar el workspace completo, borrar historial del usuario, o bloquear por tokens no medidos.
- Progress: 0%
- Reviewer: reviewer
- Acceptance:
  - [ ] El orden, procedencia y límite de bytes de cada fragmento de contexto son deterministas y verificables.
  - [ ] RED/GREEN aprobado se propaga como resumen y evidencia, no como transcript completo.
  - [ ] Una reanudación con cambios externos detecta divergencia y pide la mínima decisión necesaria.
  - [ ] Los proveedores sin telemetría dejan el coste como unknown y nunca como cero.

### BC-023 | Semántica ODD canónica y paridad de presets

- Priority: P1
- Status: READY
- Type: feature
- Depends on: BC-021
- Description: Entregar ODD desde una fuente canónica y adaptarlo por capacidades de Codex, Claude, Cursor, Gemini, OpenCode, Agy y Pi.
- Scope: fuentes de preset, renderer, capability matrix, router/ask y pruebas de paridad.
- Out of scope: Homogeneizar manualmente todo el prose histórico, asumir subagentes/hook/MCP en todos los runners, o cambiar sus configuraciones privadas.
- Progress: 0
- Reviewer: reviewer
- Acceptance:
  - [ ] Cada target instalado ofrece la misma selección de ruta ODD o declara una limitación explícita y comprobada.
  - [ ] La generación respeta la sintaxis de invocación y las capacidades declaradas por target.
  - [ ] Las instrucciones de handoff no repiten request/transcript y enlazan el ledger y la evidencia.

### BC-025 | Evaluación de adopción y guía de flujos diarios

- Priority: P2
- Status: READY
- Type: tech-debt
- Depends on: BC-022, BC-023, BC-024
- Description: Evaluar ODD contra la línea base y documentar la selección, reanudación, límites y promoción segura del flujo.
- Scope: eval suites, scorecards, README/guías de workflow, documentación de Council y release notes.
- Out of scope: Declarar ahorro sin medición o descontinuar OpenSpec/SDD.
- Progress: 0
- Reviewer: reviewer
- Acceptance:
  - [ ] Una suite repetible compara coste/contexto y calidad con criterios publicados.
  - [ ] ODD sólo pasa a recomendado por defecto si no empeora aceptación, tests o findings frente a la línea base.
  - [ ] La guía explica cuándo usar ODD, OpenSpec, TDD y council, y cómo volver al flujo formal.

### BC-013 | Cerrar el loop OpenSpec (start/done/block/archive)

- Priority: P0
- Status: DONE
- Type: feature
- Depends on: none
- Description: El CLI OpenSpec tenia validate/scan/plan/status/next pero no llamaba las transiciones de BACKLOG.md ni el estado de las TaskCards. Hay que cerrar el ciclo de entrega con start, done, block y archive.
- Scope: src/commands/openspec.command.ts, src/core/openspec/openspec-state.ts, src/cli/router.ts y tests de comando.
- Out of scope: openspec sync, ejecutar agentes al cerrar una card, husky en este repo.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] openspec start mueve la card a doing y el item a IN_PROGRESS
  - [x] openspec done marca la card done y calcula Progress; todas done con reviewRequired pasan a REVIEW
  - [x] openspec block exige --reason y deja el item BLOCKED
  - [x] openspec archive exige cards done, evidencia de review si aplica, y mueve el change folder
  - [x] Transiciones ilegales (IN_PROGRESS a PLANNED) fallan con exit 1

### BC-014 | Quorum, roster, confidence y critical findings del council

- Priority: P0
- Status: DONE
- Type: feature
- Depends on: none
- Description: Majority ignoraba roster, trataba confidence ausente como 1.0 y no miraba findings critical. El consenso debe fallar cerrado y el gate CI es ccep consensus.
- Scope: src/domain/council/council-consensus.ts, schemas ConsensusConfig, ccep consensus CLI, council.yml security-reviewer.
- Out of scope: comando top-level cc council, cambiar umbrales 0.6/0.7.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] validateBallotBox corre antes de majority y unanimous
  - [x] Majority sin roster exige 3 verdicts o ESCALATED
  - [x] Confidence ausente escala; no default 1.0
  - [x] criticalFindingsPolicy default escalate; critical de seguridad deriva veto
  - [x] ccep consensus --input @verdicts.json sale 0/1/2

### BC-015 | TaskCard ejecutable (requiredFields y schema canonico)

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: none
- Description: taskCard.requiredFields existia en 10 perfiles sin consumidores. CanonicalTaskCard debe ser la fuente de verdad de delivery y el gate ccep taskcard debe rechazar cards incompletas.
- Scope: CanonicalTaskCardSchema, src/core/ccep/task-card-validator.ts, adapters Canonical/Pipeline, classifyRisk, paridad YAML/TS.
- Out of scope: parsear markdown de docs/task-card-template.md, colapsar OpenspecTaskCardSchema en Canonical, borrar profiles.ts.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] Canonical exige type y persiste boundaries, requiresHumanReview y requiresTests
  - [x] validateTaskCardForProfile aplica requiredFields, draft, high-risk y AC no vagos
  - [x] ccep taskcard --command <wf> --input @card.json sale 1 si hay issues
  - [x] Round-trip Canonical a Pipeline no pierde scope.out
  - [x] classifyRisk marca migracion, API publica y auth/pagos como high independiente de P0
  - [x] taskCard YAML coincide con WORKFLOW_PROFILES en los 10 perfiles

### BC-016 | Registry de council-verdict fail-closed

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: none
- Description: SCHEMA_REGISTRY mapeaba council-verdict a AgentOutputSchema y un nombre desconocido caia en AgentOutput. Eso daba verde falso. Hay que registrar el agregado y fallar si el nombre no existe.
- Scope: src/core/ccep/output-validator.ts, prompt-compiler stub, tests de completitud YAML a registry.
- Out of scope: schemas Zod dedicados para test-plan o complexity-audit.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] council-verdict valida contra CouncilVerdictSchema
  - [x] Un schema desconocido no cae en AgentOutput
  - [x] Todo outputSchema de workflows YAML esta en el registry
  - [x] {status:success, confidence:1} no valida como council-verdict

### BC-017 | Drift backlog frente a TaskCards

- Priority: P2
- Status: DONE
- Type: feature
- Depends on: BC-013
- Description: Las cards de OpenSpec no recordaban un hash del item. Si BACKLOG.md cambiaba, plan reutilizaba status stale. Hay que invalidar cards drifted y reportar un cambio de tddRequired.
- Scope: backlog-planner.ts, OpenspecTaskCardSchema itemHash, handlePlan lee itemSnapshots.
- Out of scope: regenerar prompts de agentes automaticamente.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] Cada card guarda itemHash del snapshot del item
  - [x] plan resetea a pending las cards cuyo hash cambio
  - [x] Un cambio de tddRequired reporta fases reordenadas y cards reseteadas
  - [x] handlePlan consulta itemSnapshots escritos por scan

### BC-018 | Gates de validacion (version, cobertura, lint, compile skipped)

- Priority: P2
- Status: DONE
- Type: feature
- Depends on: none
- Description: CC-08 esperaba version 1.0.0 en current-status y el doc seguia en 0.5.0. Faltaba suelo de cobertura, lint stdlib y compileCheck skipped explicito.
- Scope: docs/current-status.md, bunfig.toml, scripts/lint.ts, CI, plantilla pre-commit, loop-engine compile skip.
- Out of scope: Biome/ESLint, husky en este repo, subir el umbral de cobertura por encima del suelo actual.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] current-status declara la version de package.json y CC-08 pasa
  - [x] check:coverage fija el suelo agregado al 70% y CI falla si baja (bunfig no usa coverageThreshold: bun lo aplica por archivo)
  - [x] bun run lint corre scripts/lint.ts y el hook pre-commit incluye lint
  - [x] compileCheck omitido reporta skipped con motivo, no un compile limpio silencioso

### BC-019 | Gestor de harness seguro y CLI de mantenimiento

- Priority: P0
- Status: REVIEW
- Type: feature
- Depends on: none
- Description: Convertir la instalación de CodeConductor en un gestor de harness auditable: preservar configuraciones gestionadas que el usuario modificó, registrar hashes de instalación, exponer setup/version/status y jerarquizar la ayuda.
- Scope: BACKLOG.md, package.json, scripts/build.ts, scripts/generate-cli-docs.ts, docs/{generated,getting-started,cli,concepts,development}/, src/cli/{execute,router,command-registry}.ts, src/commands/{init,install,update,setup,status,version,onboarding}.command.ts, src/core/{install,presets/update-checker}.ts y tests de CLI/estado.
- Out of scope: autoactualizar npm, aplicar una fusión YAML semántica automática ante conflictos, o publicar man pages en el sistema.
- Progress: 100%
- Reviewer: reviewer
- Acceptance:
  - [x] init e install registran hashes SHA-256 y versiones para cada archivo gestionado.
  - [x] update no sobrescribe council.yml ni policy.yml modificados localmente sin --force y devuelve un conflicto explícito.
  - [x] update planifica, hace backup y revierte las escrituras aplicadas si una actualización falla.
  - [x] version informa CLI, estado del harness, targets y skills tanto en humano como JSON; --version conserva la salida corta.
  - [x] status informa instalación, targets, configuración, actualizaciones y archivos gestionados modificados sin ejecutar doctor.
  - [x] setup admite --target, --locale, --yes y --dry-run; el dry-run no escribe y la ruta normal inicializa, instala y ejecuta diagnóstico.
  - [x] help y --help son jerárquicos; install preset --help y help install preset muestran ayuda específica.
  - [x] El inventario declarativo genera la ayuda, docs compactos incluidos en npm y completions bash/zsh/fish/powershell.

## Archive
### BC-024 | Council proporcional con recibo de candidato

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: BC-020
- Description: Reducir coste de review rutinario seleccionando un panel aplicable y vinculando cada veredicto al mismo candidato congelado, sin debilitar veto ni quorum.
- Scope: `src/domain/council/council-spec.ts`, `src/domain/council/council-consensus.ts`, `src/validation/schemas.ts`, `src/core/evaluation/outcome-store.ts`, `test/unit/domain/council/council-spec.test.ts`, `test/unit/domain/council/council-consensus.test.ts`, `test/unit/commands/ccep-consensus.test.ts`, `test/agent-contract-validation.test.ts`, `test/outcome-store.test.ts`, `BACKLOG.md`, `.codeconductor/openspec-state.json`, `.codeconductor/events.jsonl`.
- Out of scope: Eliminar reviewer, security-reviewer, complexity-auditor o los gates de riesgo actuales.
- Progress: 100%
- Reviewer: reviewer
- Acceptance:
  - [x] El panel se deriva determinísticamente de tipo, riesgo y scope, y se registra como expectedAgentIds.
  - [x] Todos los votos agregados referencian el mismo hash de diff/commit; una discrepancia falla cerrada.
  - [x] Señales de seguridad incluyen security-reviewer y preservan security/compliance veto.
  - [x] Quorum, críticos y ausencia de roles tienen pruebas de regresión.

### BC-021 | Perfil ODD y Delivery Ledger recuperable

- Priority: P0
- Status: DONE
- Type: feature
- Depends on: BC-020
- Description: Añadir una ruta ODD opt-in que use CCEP y un único Delivery Ledger de CodeConductor sólo para trabajo sustancial autorizado.
- Scope: `BACKLOG.md`, `.codeconductor/`, `README.md`, `src/cli/router.ts`, `src/commands/odd.command.ts`, `src/core/ccep/command-parser.ts`, `src/core/ccep/profiles.ts`, `src/core/ccep/workflows/odd.yml`, `src/core/delivery/delivery-ledger.ts`, `src/core/openspec/openspec-generator.ts`, `src/core/openspec/spec-quality.ts`, `src/validation/schemas.ts`, `presets/cursor/commands/cc/odd.md`, `presets/claude/commands/cc/odd.md`, `presets/opencode/commands/cc-odd.md`, `presets/agy/workflows/cc-odd.md`, `test/odd-ledger.test.ts`, `test/cc08-cli-contracts.test.ts`, `test/ccep/command-parser.test.ts`, `test/ccep/schemas.test.ts`, `test/ccep/workflow-profile.test.ts`, `test/ccep/preset-bootstrap.test.ts`, `test/unit/core/ccep/command-parser.test.ts`, `test/unit/core/ccep/task-card-parity.test.ts`.
- Out of scope: Copiar `odd/tasks`, instalar Engram/MCP, sustituir BACKLOG.md u OpenSpec, o cambiar el runtime experimental de ocho fases.
- Progress: 100%
- Reviewer: reviewer
- Acceptance:
  - [x] Una solicitud de sólo lectura y un cambio pequeño no crean ledger.
  - [x] Un cambio sustancial crea un único ledger antes de la primera escritura con objetivo, scope, tareas, aceptación, evidencia y next step.
  - [x] CCEP valida ledger y Task Card; el riesgo y ConfirmationGate existentes continúan aplicándose.
  - [x] La reanudación reconcilia ledger, árbol y punteros de memoria sin sobrescribir conflictos.

### BC-020 | Línea base de coste y selección de ruta para ODD

- Priority: P0
- Status: DONE
- Type: feature
- Depends on: none
- Description: Definir la clasificación de coordinación (pequeño, ODD rastreado u OpenSpec explícito) sin alterar los gates de riesgo, y capturar una línea base comparable de contexto, tokens, handoffs, checks y calidad.
- Scope: `AGENTS.md`, `BACKLOG.md`, `.codeconductor/`, `docs/odd-integration-plan.md`, `docs/agent-scorecard.md`, `src/core/ccep/`, `src/core/evaluation/`, `src/commands/scorecard.command.ts`, `src/cli/router.ts`, `src/validation/schemas.ts`, `test/odd-baseline.test.ts`, `test/evaluation/scorecard-signals.test.ts`.
- Out of scope: Crear el workflow ODD, cambiar rutas existentes o imponer límites de tokens donde el runner no los reporte.
- Progress: 100%
- Reviewer: reviewer
- Acceptance:
  - [x] La selección de ruta distingue autorización, coordinación y riesgo, y conserva los gates high-risk existentes.
  - [x] Un scorecard puede registrar ruta, bytes de contexto, tokens conocidos/desconocidos, handoffs, checks y resultado sin falsos ceros.
  - [x] Una suite de muestra compara al menos cambios pequeños, delivery rastreado y OpenSpec con el mismo formato de evidencia.


### BC-012 | Router /cc:ask que recomienda el slash command correcto

- Priority: P3
- Status: DONE
- Type: feature
- Depends on: BC-001
- Description: Portar ask-matt como router de baja prioridad que, dado un problema en lenguaje natural, recomienda el slash command adecuado entre feature, fix, refactor, review, tdd-cycle y openspec.
- Scope: Definir /cc:ask apoyado en /cc:help con el catálogo de flujos.
- Out of scope: Ejecutar automáticamente el flujo recomendado sin confirmación humana.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] /cc:ask mapea un problema en lenguaje natural a un slash command concreto
  - [x] La recomendación justifica por qué ese flujo encaja con el problema
  - [x] El catálogo de flujos permanece alineado con los comandos disponibles

### BC-011 | Comando /cc:handoff para traspaso entre sesiones

- Priority: P2
- Status: DONE
- Type: feature
- Depends on: none
- Description: /cc:handoff ya existe y genera `.codeconductor/sessions/handoff.md` con estado, archivos tocados y próximo comando; falta que declare explícitamente el context_scope recomendado para la próxima sesión y verificación de que una sesión nueva puede retomar el trabajo solo con ese documento.
- Scope: Actualizar presets/claude/commands/cc/handoff.md (archivo fuente versionado; .claude/commands/cc/handoff.md es una copia local gitignored) para declarar el context_scope (isolated/continuation/full) recomendado para la próxima sesión.
- Out of scope: Rediseñar el resto del documento de handoff; "compaction hook" y "context-injector" como módulos separados (no existen en este repo).
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] /cc:handoff produce un documento de handoff con el estado y los próximos pasos
  - [x] El documento declara el context_scope recomendado para la próxima sesión
  - [x] Una sesión nueva puede retomar el trabajo solo con el handoff

### BC-010 | Gate pre-commit typecheck y test adaptado a Bun

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: none
- Description: Portar setup-pre-commit adaptado a stdlib-first; un hook pre-commit mínimo que corre bun run typecheck y bun test sin añadir Husky ni lint-staged salvo que el proyecto destino ya los use.
- Scope: Plantilla de hook pre-commit y documentación del gate para agentes.
- Out of scope: Imponer Prettier o lint-staged como dependencia obligatoria.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] El hook pre-commit ejecuta typecheck y test antes de permitir el commit
  - [x] El gate no añade dependencias externas cuando el proyecto no las tiene
  - [x] Un commit con typecheck fallido queda bloqueado por el hook

### BC-009 | Hook PreToolUse que bloquea git destructivo

- Priority: P0
- Status: DONE
- Type: feature
- Depends on: none
- Description: Portar git-guardrails-claude-code como hook PreToolUse sobre Bash que intercepta y bloquea git push, reset --hard, clean -f, branch -D y checkout/restore de árbol, con exit code 2.
- Scope: Script de guardrail y wiring en presets/**/hooks.json; materializa la regla de no push directo desde agentes.
- Out of scope: Bloquear comandos no relacionados con git.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] El hook bloquea git push y git reset --hard con exit code 2
  - [x] El mensaje de bloqueo indica que el agente no tiene autoridad sobre esos comandos
  - [x] La lista de patrones bloqueados es editable por el usuario del preset

### BC-008 | Secuencia expand-contract para refactors amplios en /cc:refactor

- Priority: P2
- Status: DONE
- Type: refactor
- Depends on: BC-006
- Description: Portar el caso wide-refactor de to-tickets como secuencia expand, migrate por lotes y contract para cambios cuyo blast radius rompe muchos call sites, usando cc impact para dimensionar el radio.
- Scope: Actualizar presets/claude/commands/cc/refactor.md (archivo fuente versionado; .claude/commands/cc/refactor.md es una copia local gitignored) con la secuencia y su relación con Depends on.
- Out of scope: Refactors verticales normales que sí caben en un tracer bullet.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] /cc:refactor distingue refactor amplio de rebanada vertical por blast radius
  - [x] La secuencia expand-migrate-contract mantiene el árbol verde entre lotes
  - [x] `cc impact` cuantifica el blast radius antes de secuenciar los lotes

### BC-007 | Gate de grilling en el rol Task Coach

- Priority: P2
- Status: DONE
- Type: feature
- Depends on: BC-002
- Description: Reforzar el rol Task Coach y el paso 1 de /cc:feature con la mecánica grill (entrevista relentless que estresa supuestos) antes de aceptar el Task Card, apoyándose en el ConfirmationGate de cc ccep.
- Scope: Actualizar el contrato del rol Task Coach y .claude/commands/cc/feature.md.
- Out of scope: Añadir un motor de preguntas nuevo fuera de ccep.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] El Task Coach estresa supuestos antes de aceptar el Task Card
  - [x] Un Task Card con preguntas abiertas detiene el flujo vía ConfirmationGate de ccep
  - [x] El Task Card final cubre los seis campos requeridos sin ambigüedad

### BC-006 | Planificación tracer-bullet con aristas bloqueantes

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: none
- Description: Documentar y anclar la mecánica de to-tickets (rebanadas verticales tracer-bullet con aristas bloqueantes) sobre los items BC-NNN y el campo Depends on, en /cc:openspec y cc goal.
- Scope: Guía de planificación y ajuste de .claude/commands/cc/openspec.md; se apoya en la validación de dependencias existente.
- Out of scope: Integrar issue trackers externos como GitHub o Linear.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] La guía define tracer bullet como rebanada vertical demoable del tamaño de un contexto
  - [x] Las aristas bloqueantes se expresan como Depends on entre items BC-NNN
  - [x] `cc openspec validate` confirma ausencia de ciclos y dependencias desconocidas

### BC-005 | TDD por seams y checklist de anti-patrones en /cc:tdd-cycle

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: BC-002
- Description: Portar la skill tdd para acordar los seams antes de escribir tests y añadir el checklist de anti-patrones (implementation-coupled, tautológico, horizontal slicing) al rol Tester.
- Scope: Actualizar .claude/commands/cc/tdd-cycle.md y el contrato del rol Tester.
- Out of scope: Cambiar el runner de tests del proyecto.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] El flujo acuerda explícitamente los seams antes de escribir cualquier test
  - [x] El rol Tester verifica los tres anti-patrones antes de declarar tests listos
  - [x] Cada ciclo respeta red-before-green con una sola rebanada vertical

### BC-004 | Gate de loop rojo reproducible en /cc:fix

- Priority: P0
- Status: DONE
- Type: feature
- Depends on: none
- Description: Portar la fase 1 de diagnosing-bugs como gate obligatorio en /cc:fix; antes de hipotetizar hay que construir un comando tight y red-capable que maneje la ruta real del bug y afirme el síntoma exacto del usuario.
- Scope: Actualizar .claude/commands/cc/fix.md para bloquear la implementación hasta tener el loop; anclar el loop como check de cc verify.
- Out of scope: Automatizar la construcción del loop; sigue siendo trabajo del agente.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] /cc:fix exige un comando reproducible corrido al menos una vez antes de hipotetizar
  - [x] El loop documentado es determinista y afirma el síntoma exacto del usuario
  - [x] `cc verify --task <id>` refleja el loop rojo como evidencia de verificación

### BC-003 | Revisión de dos ejes en /cc:review

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: BC-001
- Description: Extender /cc:review con la separación de code-review en ejes Standards y Spec, ejecutados como sub-agentes paralelos, incorporando el baseline de code smells de Fowler y sin rerankear entre ejes.
- Scope: Actualizar .claude/commands/cc/review.md y el rol Reviewer; registrar verdicto con cc scorecard.
- Out of scope: Cambiar el motor de scorecard o los pesos de evaluación.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] /cc:review ejecuta los ejes Standards y Spec en sub-agentes separados
  - [x] El eje Standards aplica el baseline de code smells salvo override documentado del repo
  - [x] El verdicto se registra con `cc scorecard record --verdict PASS|REVISE|REJECT`

### BC-002 | CONTEXT.md como glosario de dominio y criterios ADR

- Priority: P1
- Status: DONE
- Type: feature
- Depends on: none
- Description: Portar domain-modeling estableciendo CONTEXT.md como glosario puro (sin detalles de implementación) y los tres criterios para crear un ADR (difícil de revertir, sorprendente sin contexto, resultado de un trade-off real).
- Scope: CONTEXT.md raíz y plantilla ADR bajo docs/adr; vocabulario consumible por Task Coach, Architect y Tester.
- Out of scope: Migrar toda la terminología histórica del repo de una vez.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] CONTEXT.md existe y contiene solo glosario sin detalles de implementación
  - [x] La plantilla ADR documenta las tres condiciones de creación
  - [x] Un término ambiguo del dominio queda resuelto y registrado en CONTEXT.md

### BC-001 | Rúbrica writing-for-agents para auditar prompts de agentes

- Priority: P1
- Status: DONE
- Type: tech-debt
- Depends on: none
- Description: Portar la disciplina de writing-for-agents como rúbrica de revisión de los contratos de agente y slash commands (punteros de contexto, disclosure progresiva, leading words, criterios de completitud, positivo sobre negación).
- Scope: Rúbrica en docs y checklist aplicable a CLAUDE.md, .claude/commands/** y presets/**.
- Out of scope: Reescritura masiva de todos los prompts en un solo item.
- Progress: 100
- Reviewer: reviewer
- Acceptance:
  - [x] Existe un checklist de auditoría de prompts documentado en docs/
  - [x] La revisión detecta al menos un no-op o una negación convertible a positivo en los slash commands actuales
  - [x] El checklist referencia los criterios de completitud verificables por paso
