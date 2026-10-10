# Cambios posteriores a v1.6.1

Esta guía cubre los 11 commits de `v1.6.1..3e5a553`, hasta el 10 de octubre
de 2026. El paquete sigue declarando **1.6.1**: estos cambios están
implementados en el repositorio y todavía no constituyen una publicación 1.7.
Las capacidades anteriores siguen en el [changelog](../CHANGELOG.md); el
[estado del producto](current-status.md) distingue disponibilidad y planes.

Los ejemplos usan `bun run dev` dentro de este checkout. En proyectos
consumidores, las instrucciones instaladas usan `npx cc-codeconductor`;
necesitan una publicación que incluya estos cambios para obtenerlos.

## Entrega OpenSpec y evidencia TDD

`openspec next` consulta la cola sin ejecutar el compile check ni modificar
archivos. Si hay una card en curso, la identifica. Los compile checks y la
captura de evidencia usan APIs de Node, sin depender del global `Bun`.

`openspec done` conserva las ediciones del agente en `tasks.md` y marca las
casillas de aceptación asociadas a la card mediante sus etiquetas. No marca
automáticamente pasos operativos pendientes. `archive` bloquea casillas sin
marcar y completa los criterios de aceptación de `BACKLOG.md` al archivar;
`verify` muestra `archiveReady: false` mientras quedan casillas abiertas.
`--allow-unchecked` permite una excepción explícita al gate de casillas.

El nuevo comando `tdd capture` ejecuta la suite y registra evidencia verificable:

```bash
bun run dev openspec start BC-001-test
bun run dev tdd capture --task BC-001-test --phase red --command "bun test test/feature.test.ts"
bun run dev openspec done BC-001-test
# Tras completar el diseño aprobado e implementar:
bun run dev openspec start BC-001-implement
bun run dev tdd capture --task BC-001-implement --phase green --command "bun test test/feature.test.ts"
bun run dev openspec done BC-001-implement
bun run dev openspec analyze --output json
bun run dev openspec verify BC-001 --output json
```

El flujo de cierre de este ejemplo presupone `TDD required: yes` en la sección
Global de `BACKLOG.md`. Los identificadores son ejemplos: usa las cards y la
suite de tu cambio.
RED exige una ejecución con salida fallida; un timeout, un error al arrancar
el proceso o una suite que pasa no prueban RED. GREEN exige una suite que pasa.
`--allow-compile-check` habilita explícitamente comandos fuera de la lista
de pruebas admitidas; no convierte un fallo de arranque en evidencia RED.

Cuando Global exige TDD, al cerrar la card de test `done` verifica RED contra
el candidato actual y
persiste `.codeconductor/tdd-validations/<card>.json`. Ese registro conserva
la validez histórica de RED después de implementar. GREEN exige un recibo
actual. Cuando TDD es obligatorio, `analyze` y `scorecard create` requieren
ambas fases por separado.
RDD vincula la evidencia a hashes del candidato; la captura manual de un
recibo RDD no ejecuta pruebas ni sustituye `tdd capture`.

Para compartir o clonar la entrega, conserva juntos los directorios
`.codeconductor/tdd-validations/`, `.codeconductor/rdd-receipts/` y
`.codeconductor/evidence/`. Un registro RED sin sus evidencias y recibos
no satisface el gate.

## Novedades del harness

### Skills compartidas y comandos de consumidores

BC-026 mueve 14 skills duplicadas a `skills/<nombre>/` y al manifiesto
`src/presets/shared-skills.yml`: android, backlog, conductor-setup,
django-testing, find-skills, laravel-specialist, pagespeed-insights,
pagespeed-perf, php-pro, python-django-stack, python-fastapi-stack, security,
spring-boot-kotlin y sqlalchemy. `bun run sync:skills` genera sus copias.
Las copias Cursor mantienen su contenido; siete copias Codex/OpenCode tienen
ajustes de formato. Los autores deben editar la fuente canónica y regenerar.

Las skills, comandos, presets y mensajes de hooks para consumidores indican
`npx cc-codeconductor`. `bun run dev` se reserva al desarrollo de este repo.
El bootstrap CCEP generado también usa la invocación del consumidor.

### Instalación Claude

La instalación de `settings.json` usa merge JSON también en proyectos.
Conserva preferencias y plugins propios, y limita las actualizaciones a claves
gestionadas. Un JSON inválido produce un error sin sobrescribirlo. El preset
limpio retira permisos amplios de intérpretes, ejecutores y WebFetch, y deja
de activar claude-seo por defecto. Los permisos amplios preexistentes se
conservan con avisos para revisión; reinstalar no los elimina silenciosamente.

### Resolución del runner y protección de hooks

El wrapper busca CodeConductor instalado localmente o en una instalación
global. No ejecuta el `src/cli/main.ts` ni el `dist/index.js` arbitrario del
proyecto consumidor. `CC_DEV=1` habilita esas rutas únicamente para un
checkout de desarrollo que declara el paquete `cc-codeconductor`.

`CC_HOOK_FAIL_CLOSED=1` o `--fail-closed` hacen que `pre-tool` deniegue cuando
el runner no está disponible, falla o agota el timeout. El comportamiento
abierto sigue siendo el predeterminado. `session-start` avisa si la protección
no está operativa y `doctor` comprueba el runner mediante un probe.
Los contratos de salida de Claude/Muse y Antigravity se conservan.
Consulta [hooks.md](hooks.md) para la configuración operativa.

## Orquestación y specs

El Goal DAG se escribe mediante temporales únicos y rename. Un lock entre
procesos protege cargar, seleccionar y transicionar: `orchestrate next`
reclama la tarea de forma atómica. Este comportamiento es distinto de la
consulta `openspec next`. El lock respeta propietarios vivos y recupera
propietarios muertos del mismo host cuando su antigüedad lo permite;
los registros de recuperación se conservan en
`.codeconductor/queue/recoveries/`.

Las tareas admiten prioridad opcional, selección determinista y bloqueo
transitivo por dependencias. La validación diagnostica la ruta de los ciclos
y evita arrancar tareas con dependencias pendientes. No se introduce un
nuevo runtime Kotlin ni una cola transaccional con reducer/event log.

Las delta specs aceptan requisitos con nombre sin `FR-###`, con identificadores
`req:<capability>/<slug>`, y escenarios WHEN/THEN. Se conservan los IDs FR/SC
existentes. Además de ADDED/MODIFIED/REMOVED, se admite RENAMED con FROM/TO;
un origen ausente o un destino en conflicto bloquean la sincronización sin
modificar las specs duraderas. Véase [SDD.md](SDD.md).

## Scorecards y mediciones

El primer `openspec start` de un ítem registra el HEAD Git en
`itemBaseCommits` dentro de `.codeconductor/openspec-state.json`. El scorecard
del ítem compara contra esa base, incluyendo cambios ya comprometidos durante
la entrega. Si Git no permite resolver HEAD, `start` informa un aviso; sin
base registrada, el cálculo utiliza HEAD como fallback.

Los criterios sin medición usan `score: null` y `unmeasured: true`. La ausencia
de evidencia de tests o de un diff para complejidad no recibe un aprobado
implícito. Un criterio pendiente impide PASS y puede producir REVISE o REJECT
según los demás gates y el puntaje. Para resolverlo manualmente se requiere
un puntaje, `autoSuggested: false` y notas justificadas. Los reportes de
ablación conservan los valores sin medir, sin tratarlos como éxito.

## Actualización de entregas existentes

- En cambios antiguos con casillas sin etiquetas, revisa y marca las casillas
  manualmente, vuelve a planificar o usa conscientemente `--allow-unchecked`.
  Revisa los artefactos antes de volver a ejecutar `plan`.
- Las cards de test cerradas antes de persistir RED no tienen ese registro:
  una evidencia RED obsoleta no basta para el nuevo gate. Captura y valida
  RED en el candidato donde la suite realmente falla antes de avanzar a GREEN.
- Si cambia código, contratos, tests o configuración después de GREEN,
  repite la verificación afectada y captura evidencia actual.
- Revisa los avisos de permisos conservados y ejecuta `doctor` después de
  actualizar el harness.

## Trazabilidad de commits

| Commit | Mejora o ajuste |
| --- | --- |
| `7886225` | Compile check portable y `openspec next` de consulta. |
| `fee1c40` | Preservación de `tasks.md`, marcado por card y gate de casillas. |
| `d04fa2b` | Comando `tdd capture` con evidencia RED/GREEN del runner. |
| `92f9ef7` | Invocación `npx` para consumidores y documentación de gates. |
| `147fa3c` | Marcado solo de aceptación, RED con ejecución real y ajustes de instrucciones. |
| `56d9407` | Migración de 14 skills a fuentes compartidas (BC-026). |
| `a8ae760` | Registro del scorecard REVISE de BC-026 por `cc_gain`. |
| `926741f` | Archivo de BC-026 con PASS tras override aprobado de `cc_gain`. |
| `104aa8c` | Cinco cimientos 1.7: Claude, hooks, locks, DAG y delta specs. |
| `29b0465` | Persistencia de RED validado y cierre de BC-027. |
| `3e5a553` | Base Git por ítem y conservación de señales sin medir. |

El override de BC-026 es evidencia de esa entrega, no una exención general.
Detector ampliado, init con plan, uninstall, reducer/cola transaccional,
drivers y paralelismo adicional siguen fuera de estos cinco cimientos;
su propuesta está en el [plan técnico](research-implementation-plan.md).
