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

### BC-007 | Gate de grilling en el rol Task Coach

- Priority: P2
- Status: TODO
- Type: feature
- Depends on: BC-002
- Description: Reforzar el rol Task Coach y el paso 1 de /cc:feature con la mecánica grill (entrevista relentless que estresa supuestos) antes de aceptar el Task Card, apoyándose en el ConfirmationGate de cc ccep.
- Scope: Actualizar el contrato del rol Task Coach y .claude/commands/cc/feature.md.
- Out of scope: Añadir un motor de preguntas nuevo fuera de ccep.
- Acceptance:
  - [ ] El Task Coach estresa supuestos antes de aceptar el Task Card
  - [ ] Un Task Card con preguntas abiertas detiene el flujo vía ConfirmationGate de ccep
  - [ ] El Task Card final cubre los seis campos requeridos sin ambigüedad

### BC-008 | Secuencia expand-contract para refactors amplios en /cc:refactor

- Priority: P2
- Status: TODO
- Type: refactor
- Depends on: BC-006
- Description: Portar el caso wide-refactor de to-tickets como secuencia expand, migrate por lotes y contract para cambios cuyo blast radius rompe muchos call sites, usando cc impact para dimensionar el radio.
- Scope: Actualizar .claude/commands/cc/refactor.md con la secuencia y su relación con Depends on.
- Out of scope: Refactors verticales normales que sí caben en un tracer bullet.
- Acceptance:
  - [ ] /cc:refactor distingue refactor amplio de rebanada vertical por blast radius
  - [ ] La secuencia expand-migrate-contract mantiene el árbol verde entre lotes
  - [ ] `cc impact` cuantifica el blast radius antes de secuenciar los lotes

### BC-009 | Hook PreToolUse que bloquea git destructivo

- Priority: P0
- Status: READY
- Type: feature
- Depends on: none
- Description: Portar git-guardrails-claude-code como hook PreToolUse sobre Bash que intercepta y bloquea git push, reset --hard, clean -f, branch -D y checkout/restore de árbol, con exit code 2.
- Scope: Script de guardrail y wiring en presets/**/hooks.json; materializa la regla de no push directo desde agentes.
- Out of scope: Bloquear comandos no relacionados con git.
- Acceptance:
  - [ ] El hook bloquea git push y git reset --hard con exit code 2
  - [ ] El mensaje de bloqueo indica que el agente no tiene autoridad sobre esos comandos
  - [ ] La lista de patrones bloqueados es editable por el usuario del preset

### BC-010 | Gate pre-commit typecheck y test adaptado a Bun

- Priority: P1
- Status: READY
- Type: feature
- Depends on: none
- Description: Portar setup-pre-commit adaptado a stdlib-first; un hook pre-commit mínimo que corre bun run typecheck y bun test sin añadir Husky ni lint-staged salvo que el proyecto destino ya los use.
- Scope: Plantilla de hook pre-commit y documentación del gate para agentes.
- Out of scope: Imponer Prettier o lint-staged como dependencia obligatoria.
- Acceptance:
  - [ ] El hook pre-commit ejecuta typecheck y test antes de permitir el commit
  - [ ] El gate no añade dependencias externas cuando el proyecto no las tiene
  - [ ] Un commit con typecheck fallido queda bloqueado por el hook

### BC-011 | Comando /cc:handoff para traspaso entre sesiones

- Priority: P2
- Status: TODO
- Type: feature
- Depends on: none
- Description: Portar handoff y claude-handoff para compactar la conversación en un documento de handoff consumible por la siguiente sesión, integrado con context_scope y el compaction hook existentes.
- Scope: Definir /cc:handoff y su plantilla de documento; reutiliza context-injector y compaction.
- Out of scope: Lanzar automáticamente un agente en background.
- Acceptance:
  - [ ] /cc:handoff produce un documento de handoff con el estado y los próximos pasos
  - [ ] El documento declara el context_scope recomendado para la próxima sesión
  - [ ] Una sesión nueva puede retomar el trabajo solo con el handoff

### BC-012 | Router /cc:ask que recomienda el slash command correcto

- Priority: P3
- Status: TODO
- Type: feature
- Depends on: BC-001
- Description: Portar ask-matt como router de baja prioridad que, dado un problema en lenguaje natural, recomienda el slash command adecuado entre feature, fix, refactor, review, tdd-cycle y openspec.
- Scope: Definir /cc:ask apoyado en /cc:help con el catálogo de flujos.
- Out of scope: Ejecutar automáticamente el flujo recomendado sin confirmación humana.
- Acceptance:
  - [ ] /cc:ask mapea un problema en lenguaje natural a un slash command concreto
  - [ ] La recomendación justifica por qué ese flujo encaja con el problema
  - [ ] El catálogo de flujos permanece alineado con los comandos disponibles

## Archive

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
