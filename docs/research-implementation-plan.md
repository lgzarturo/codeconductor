# Plan técnico: mejoras derivadas de research/

Estado: plan aprobado por el usuario; implementación de los cinco bloques 1.7.

## Fuentes y precedencia

- `research/codeconductor-mejoras-2026-10-09.md`: diagnóstico, detección e instalación.
- `research/codeconductor-maquina-estados-2026-10-09.md`: diseño vigente de orquestación; reemplaza explícitamente el spike Kotlin.
- `research/codeconductor-spike-orquestador-2026-10-09.md`: contexto histórico, no una instrucción de añadir un runtime Kotlin.

Los documentos describen entregas distintas para 1.7, 1.8 y 2.0. Se propone
empezar por los cinco PR de cimientos 1.7 del documento de máquina de estados.
Las otras mejoras 1.7 del diagnóstico (detector, init, uninstall, CI y release)
requieren entregas adicionales; esta propuesta no las declara implementadas.

## Punto de partida

Base Git: `926741f3862d823c978285e91fe1e632b01a4b6e`, rama `main`.
Hay cambios previos de BC-027 en OpenSpec/RDD, BACKLOG y CHANGELOG; conservarlos
y excluirlos del commit de esta entrega, salvo hunks nuevos identificados.

El typecheck actual pasa. OpenSpec validate pasa; analyze no reporta CRITICAL,
pero el cambio activo es BC-027, distinto de esta propuesta. No usar sus cards
ni sus evidencias para cerrar trabajo de research.
Baseline focalizado: 85 pruebas pasan y 3 fallan antes de cambiar implementación.
Dos fallos son stdout vacío en comandos del hook Agy; el tercero es timeout
en replay de stdin. Log: `/tmp/cc-research-baseline-tests.log`. Estos resultados
no constituyen una suite verde ni evidencia de implementación terminada.

## Implementación propuesta, en orden

### 1.7-1: instalación Claude y permisos mínimos

Modificar `presets/claude/settings.json`, `src/presets/manifests/claude.yml` y,
si la integración lo exige, `src/core/presets/file-copier.ts`.

Eliminar del preset permisos de intérpretes/ejecutores arbitrarios y WebFetch
general; retirar la activación implícita de claude-seo. Usar merge-json también
en proyecto y limitar el preset a claves gestionadas para conservar preferencias
personales. No añadir un sistema de módulos adelantando 1.8.

El merge existente reemplaza escalares coincidentes y une arrays. Cambiar solo
el manifiesto no garantiza preservar preferencias ni retirar permisos heredados.
La implementación debe definir y verificar qué claves son gestionadas, conservar
las demás y hacer visible cualquier permiso amplio preexistente que se conserve.
JSON existente inválido debe producir un error sin sobrescribir su contenido.

Aceptación: instalación limpia sin npx/python/dlx/WebFetch generales; preferencias
y plugins propios preservados; segunda aplicación produce el mismo contenido.

### 1.7-2: resolución confiable del hook

Modificar `presets/shared/invoke-hook.cjs`, sus copias mantenidas en paridad y
la integración de doctor/configuración necesaria para el modo failClosed.

Resolver la instalación de CodeConductor, sin ejecutar src/cli/main.ts ni
dist/index.js del consumidor. Desarrollo local requiere CC_DEV=1 explícito.
Las rutas adicionales de un lock solo son utilizables si su hash se verifica.
Pre-tool con failClosed deniega si el runner falta, falla o agota el timeout;
session-start informa si la protección no está operativa. Mantener contratos
de salida de cada host y un único documento JSON en stdout.

Aceptación: un CLI falso del consumidor nunca se ejecuta por defecto; runner
instalado recibe stdin; fallos se deniegan con failClosed; doctor informa el estado.

### 1.7-3: persistencia atómica y exclusión entre procesos

Crear `src/core/queue/lock.ts`; modificar `src/core/goal/goal-state.ts`,
`src/core/orchestrator/runtime-orchestrator.ts` y la selección en
`src/commands/orchestrate.command.ts` según sea necesario.

Usar temporales únicos más rename para writeGoal. Lock exclusivo con PID,
hostname, timestamp y token de propietario; recuperar solo locks suficientemente antiguos de un PID
muerto del mismo host. Un error de permisos al comprobar el PID no prueba que
esté muerto. No suponer muerto un PID de otro host. Liberar en finally solo el
lock cuyo token corresponda a la operación actual.
La recuperación usa registros inmutables por token en queue/recoveries,
creados con exclusión. Si su propietario muere, se elige un sucesor mediante
otro registro; nunca se reemplaza un registro vivo para recuperar el lock.
La sección crítica abarca cargar, seleccionar y transicionar, incluidas las
escrituras operacionales y rollback existentes. Un lock solo sobre writeGoal
no evita que dos procesos reclamen la misma tarea.

Aceptación: dos procesos no reclaman la misma tarea ni pierden actualizaciones;
YAML válido tras escrituras concurrentes; lock vivo respetado y huérfano recuperado.

### 1.7-4: DAG y selección determinista

Modificar el esquema GoalTask solo con campos necesarios, validación del goal
y selección del orquestador. Prioridad opcional con compatibilidad para goals
anteriores; desempate estable por orden de origen e id. Propagar bloqueo por
dependencias sin sobrescribir tareas terminadas. Mostrar ruta del ciclo al rechazar.

Aceptación: ciclos con diagnóstico útil, descendientes bloqueados transitivamente,
prioridad estable, ninguna tarea con dependencias pendientes puede arrancar.

### 1.7-5: delta specs compatibles

Modificar `src/core/openspec/spec-files.ts`, `spec-quality.ts`, `spec-sync.ts`
y consumidores de identificadores que necesiten integrar el nuevo contrato.

Preservar FR existentes, generar ids req:<capability>/<slug> para nombres sin FR,
reconocer escenarios WHEN/THEN y separar bloques por secciones delta. Exponer
deltaOperation para ADDED/MODIFIED/REMOVED/RENAMED. Sync ya implementa las tres
primeras operaciones: extender su comportamiento en vez de reemplazarlo.
RENAMED debe tratar el formato FROM/TO y rechazar origen ausente o destino en
conflicto. Ajustar calidad/trazabilidad para que las specs oficiales funcionen
en el flujo completo, conservando la validación de los documentos FR/SC actuales.

Aceptación: fixture oficial sin FR y fixture propio con FR aceptados; operaciones
delta aplicadas; ids existentes estables; conflictos no escriben specs duraderas.

## Interfaces de prueba y gates

Interfaces aprobadas: CLI público, instalación de presets, hook como proceso
y parser público de specs. Verificar goal/DAG y concurrencia a través del CLI
orchestrate, con subprocesos reales.

Tras confirmar: ciclos verticales RED→GREEN con captura del runner cuando aplique,
tests focalizados y typecheck periódico. Suite completa una vez al finalizar,
lint y build apropiados; recibo RDD del candidato actual; revisión Standards/Spec
antes del commit. No hacer push ni publicar un release como parte de esta entrega.

### Configuración del hook

- Resolución normal: paquete instalado en node_modules o instalación global
  de cc-codeconductor. No ejecutar source/dist arbitrarios del consumidor.
- `CC_DEV=1`: habilita source/dist del checkout de desarrollo cuyo package.json
  declara cc-codeconductor. Usarlo solo en un checkout confiable.
- `CC_HOOK_FAIL_CLOSED=1` o `--fail-closed`: pre-tool deniega si el runner no
  está operativo; la salida respeta los contratos Claude/Muse y Agy.
- `doctor` comprueba el runner con un probe; session-start avisa en stderr si
  falta. El modo abierto sigue siendo compatible cuando no se configura el cierre.

El hook es defensa en profundidad. No sustituye el sandbox del runtime ni
convierte un proyecto no confiable en seguro. Se conservan permisos propios
del usuario durante merge-json, informando permisos amplios heredados para
su revisión; el preset limpio no añade ejecución arbitraria ni acceso web amplio.
El plugin SEO deja de activarse por defecto y cualquier plugin existente sigue
siendo responsabilidad de la configuración explícita del usuario.

## Entregas posteriores

- Completar el resto del diagnóstico 1.7: detector, init con plan, uninstall,
  permisos de skills, invocaciones versionadas y CI/publicación verificable.
- 1.8: reducer, cola/log transaccional, migración, integración OpenSpec,
  checks de aceptación, gates, prompts acotados y drivers opcionales.
- 2.0: migraciones incompatibles, retirada de orchestrate, BACKLOG como vista,
  adaptador Beads y paralelismo. Necesita elección explícita de alcance.
