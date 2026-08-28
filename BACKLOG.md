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

## Archive

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
