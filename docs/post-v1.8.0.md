# Cambios posteriores a v1.8.0

El foco principal de este conjunto de cambios fue la **regeneración de la
baseline M5 cheap con telemetría fail-closed**, resolviendo la inestabilidad de
cuotas de OpenRouter, el aislamiento de credenciales y la prevención de costos
descontrolados en entornos de CI.

---

## 1. Proxy Local de Telemetría Fail-Closed

El nuevo módulo
[`src/core/evaluation/bench/openrouter-request-proxy.ts`](<[file:///home/algforge/work/codeconductor/src/core/evaluation/bench/openrouter-request-proxy.ts](https://github.com/lgzarturo/codeconductor/blob/main/src/core/evaluation/bench/openrouter-request-proxy.ts)>)
implementa un servidor HTTP local que intercepta el tráfico entre Claude Code y
OpenRouter:

### Características Clave

- **Tope Duro de Presupuesto:** Configurado por defecto en 100 peticiones
  (`DEFAULT_OPENROUTER_REQUEST_CAP`). Al recibir la petición 101 contable, el
  proxy responde de inmediato con HTTP 403 y rechaza la conexión hacia upstream.
- **Contador Persistente Atómico:** El estado se guarda en disco bajo el esquema
  `openrouter-request-counter/v1`. La escritura utiliza un archivo temporal y
  reemplazo atómico con `rename`. Si el archivo de conteo no puede leerse o
  escribirse, el proxy aborta de manera fail-closed.
- **Acumulación de Presupuesto entre Corridas:** Mediante la opción
  `initialCount` (o la variable `BENCH_REQUESTS_ALREADY_USED`), el proxy se
  inicializa con las peticiones ya consumidas en ejecuciones previas de GitHub
  Actions.
- **Filtrado de Rutas Contables:** Únicamente los métodos `POST` dirigidos a
  rutas de mensajería (`/v1/messages`, `/v1/chat/completions`) descuentan del
  presupuesto. Verificaciones de salud (`/health`) o métodos `HEAD` no se
  descuentan.
- **Rate Limiting de Espera en Cola (20 req/min):** En lugar de emitir un código
  HTTP 429 (que provocaría bucles de reintentos en el cliente), el limitador de
  tasa retiene la solicitud en cola asíncrona hasta que se abre un cupo en la
  ventana deslizante de 60 segundos.
- **Aislamiento de Credenciales Upstream:** El cliente Claude Code recibe un
  token efímero de un solo uso con prefijo `cc-proxy-local-` en
  `ANTHROPIC_AUTH_TOKEN`. La variable real `OPENROUTER_API_KEY` no se exporta al
  entorno de Claude Code; el proxy valida el token local y realiza la inyección
  de la clave real únicamente en el salto hacia `openrouter.ai`.
- **Reescritura de Rutas `/api`:** Claude Code añade `/v1/messages` a
  `ANTHROPIC_BASE_URL`. Para OpenRouter, el path upstream requiere
  `/api/v1/messages`. El proxy expone `anthropicBaseUrl` apuntando a `/api` y
  reescribe transparentemente peticiones con `/v1/` huérfano.

---

## 2. Candado de Gasto (Spend Lock)

El módulo
[`src/core/telemetry/openrouter-spend-lock.ts`](file:///home/algforge/work/codeconductor/src/core/telemetry/openrouter-spend-lock.ts)
amplía la protección financiera para admitir tanto modelos gratuitos como
modelos de pago ultra-económicos:

- **Límite de Gasto por Repositorio:** Fijado en `$0.49 USD` para este
  repositorio (`DEFAULT_OPENROUTER_SPEND_CAP_USD`), manteniendo un límite
  conjunto de `$0.99 USD` entre repositorios vinculados.
- **Verificación Pre y Post Corrida:** Consulta `/api/v1/key` antes de iniciar
  la ejecución y al finalizar. Si el incremento de uso (`usage Δ`) alcanza o
  supera el umbral de aproximación (90% del límite, es decir, `~$0.441 USD`), la
  ejecución aborta y el resultado se invalida.
- **Soporte de Modelos de Pago:** Permite la selección de modelos de bajo costo
  (como `deepseek/deepseek-v4-flash` a `$0.091/$0.182` por millón de tokens)
  cuando el catálogo gratuito (`:free`) presenta indisponibilidad o degradación.

---

## 3. Host Claude Code y Entorno de Ejecución

En
[`src/core/evaluation/bench/host-claude.ts`](file:///home/algforge/work/codeconductor/src/core/evaluation/bench/host-claude.ts)
se establecieron las siguientes restricciones para garantizar repetibilidad:

- **Versión Fijada:** Pinned a `@anthropic-ai/claude-code@2.1.197` en CI para
  evitar roturas observadas en versiones 2.1.300+.
- **Reintentos en Cero:** Se fijan `CLAUDE_CODE_MAX_RETRIES=0` y
  `ANTHROPIC_MAX_RETRIES=0` para que cualquier error sea reportado de inmediato
  al harness sin reintentos ciegos.
- **Configuración No Interactiva:** Se inyecta automáticamente
  `hasTrustDialogAccepted: true` y `hasCompletedProjectOnboarding: true` en
  `~/.claude/settings.json`.
- **Sanitización de Errores:** En caso de fallo (`is_error: true`), la salida se
  trunca y se limpian claves de API, IDs de sesión y rutas locales antes de
  generar los artefactos de reporte.

---

## 4. Workflow de Benchmarking (`bench-baseline.yml`)

El flujo de GitHub Actions
[`.github/workflows/bench-baseline.yml`](file:///home/algforge/work/codeconductor/.github/workflows/bench-baseline.yml)
incorpora:

1. **Selector de Modalidad:**
   - `sonda`: Ejecuta únicamente 1 celda baseline (N=1) de la tarea
     `fix-add-off-by-one`.
   - `matrix`: Ejecuta la matriz completa de 6 celdas (1 tarea × 2 variantes ×
     N=3).
2. **Disparo Flexible:** Soporta `workflow_dispatch` con menú desplegable y
   eventos `push` hacia la rama `bench/baseline-m5-run` leyendo la modalidad
   desde el archivo `.bench-mode`.
3. **Regla de Paro (Sonda Gate):** La matriz completa solo se ejecuta si la
   sonda previa concluye con `success=true` en el oráculo de verificación. Si la
   celda de sonda falla, se aplica la regla de paro para preservar las
   peticiones restantes.
4. **Ajuste de Turnos:** Se configuró `BENCH_MAX_TURNS=6` (en sustitución de
   `3`), ya que las pruebas previas demostraron que 3 turnos producían fallas
   sistemáticas por `error_max_turns`.

---

## 5. Auditoría de Pruebas y Estado Actual

Se ejecutaron un total de 7 corridas en GitHub Actions correspondientes a las
campañas de evaluación de Cohere y DeepSeek:

| Hito / Corrida                                 | Modelo            | Resultado                                                                                   | Estado del Presupuesto                                   |
| :--------------------------------------------- | :---------------- | :------------------------------------------------------------------------------------------ | :------------------------------------------------------- |
| **Runs 39777070216, 39777659383, 39778489974** | Cohere Mini Code  | Abortos en fase smoke (incompatibilidad de versión y fallas de catálogo upstream).          | Presupuesto preservado (10/100 consumidas, $0.00 gasto). |
| **Run 39789258349**                            | Cohere Mini Code  | Smoke superado; aborto limpio en celda 4 al alcanzar el tope de 100/100 requests.           | $0.00000298 USD gastados.                                |
| **Run 39800247302 (Sonda)**                    | DeepSeek v4 Flash | Éxito en celda baseline (`success=true`).                                                   | 9 peticiones consumidas, $0.00 gasto.                    |
| **Run 39800579851 (Matriz)**                   | DeepSeek v4 Flash | Matriz accidental con `maxTurns=3`. Veredicto `RECHAZA` por `error_max_turns` en treatment. | 55 peticiones acumuladas, +$0.056 USD gasto.             |
| **Run 39801814203 (Sonda)**                    | DeepSeek v4 Flash | Sonda con `maxTurns=6`. Finalizó ejecución pero oráculo dio `success=false`. Paro aplicado. | 60/100 peticiones acumuladas, 40 restantes.              |

El reporte exhaustivo de cada una de estas corridas con sus causas técnicas y
trazas de error se encuentra documentado en: 👉
[Reporte de Auditoría de Telemetría M5 (`docs/reports/2026-10-m5-bench-baseline-telemetry.md`)](file:///home/algforge/work/codeconductor/docs/reports/2026-10-m5-bench-baseline-telemetry.md)

---

## 6. Verificación Local

Para verificar la suite completa de telemetría y el proxy sin consumir saldo de
red ni requerir tokens de OpenRouter, ejecute:

```bash
bun test test/telemetry/
```

Esta suite contiene 114 pruebas unitarias e integrales que validan:

- Rechazo atómico de peticiones excedentes (101+).
- Encolamiento y espera en la ventana deslizante de 20 req/min.
- Prevención de fuga de credenciales en variables de entorno del subproceso.
- Sanitización de salidas de error y persistencia del candado de gasto.

---

## 7. Ejecución manual (CI) y local (Claude Code)

### Defectos de medición hallados en las 7 corridas previas

1. **Treatment sin arnés efectivo.** El stderr de cada celda treatment decía
   `Ignoring 4 permissions.allow entries from .claude/settings.json: this workspace has not been trusted`.
   La confianza vive en `.claude.json → projects[cwd].hasTrustDialogAccepted`, no en
   `~/.claude/settings.json`. Ahora cada llamada a Claude recibe un
   `CLAUDE_CONFIG_DIR` temporal (`prepareIsolatedClaudeConfig`) que confía solo en
   el `cwd` de la celda. El mismo mecanismo aísla el `~/.claude` del usuario
   (plugins, hooks, CLAUDE.md global) de ambos brazos.
2. **Prompt ambiguo.** El modelo recibía solo `task.prompt` y a veces respondía en
   texto sin editar. `buildTaskPrompt` añade `Files in scope`, los
   `Acceptance criteria` de `suite.yml` y `Apply the change by editing the files.`
   El texto es idéntico en baseline y treatment.
3. **maxTurns sesgaba contra treatment.** El flujo multi-rol del arnés moría por
   `error_max_turns` con 3–6 turnos. El default pasa a **12**.

Las baselines archivadas en `eval/baselines/m5-cheap/` usan el prompt anterior y
no son comparables con corridas nuevas.

### CI (OpenRouter) — solo `workflow_dispatch`

`bench-baseline.yml` ya no se dispara por `push`. Inputs: `mode` (sonda|matrix),
`model` (acepta ids `:free`), `requests_already_used` (semilla del contador
acumulado; estado actual **60**), `max_turns` (12), `n` (3), `task_ids`,
`max_spend_usd` (0.49). El tope acumulado de 100 requests es fijo. Una corrida en
curso no se cancela.

```bash
gh workflow run bench-baseline.yml -f mode=sonda -f requests_already_used=60
```

Actualice `requests_already_used` con el `proxyRequestCount` del artefacto
anterior antes de cada disparo.

### Local (Claude Code + Opus/Sonnet/Haiku 5.5)

Sin proxy ni OpenRouter. Credencial: `CLAUDE_CODE_OAUTH_TOKEN` (preferida si
ambas existen) o `ANTHROPIC_API_KEY`. Todos los alias y subagentes se fijan al
modelo elegido.

| Variable | Default | Uso |
| --- | --- | --- |
| `BENCH_MODEL` | `sonnet` | `opus`, `sonnet`, `haiku` o id completo |
| `BENCH_MODE` | `sonda` | `sonda` (1 celda baseline) o `matrix` |
| `BENCH_N` | 1 sonda / 3 matrix | repeticiones por tarea × brazo |
| `BENCH_MAX_TURNS` | `12` | `--max-turns` por intento |
| `BENCH_TASK_IDS` | `fix-add-off-by-one` | ids de `harness-v1` |
| `BENCH_MAX_REQUESTS` | `100` | medidor de stream |
| `BENCH_MAX_SPEND_USD` | `2` | suma de `total_cost_usd`; restante pasa como `--max-budget-usd` |
| `BENCH_OUT_DIR` | `bench-out/local-<modelo>` | `bench-local.json`, `bench-report.md/json` |

```bash
BENCH_MODEL=haiku BENCH_MODE=sonda bun run bench:local
BENCH_MODEL=haiku BENCH_MODE=matrix BENCH_N=1 BENCH_MAX_SPEND_USD=0.5 bun run bench:local
BENCH_MODEL=opus BENCH_MODE=matrix bun run bench:local
```

El costo del smoke (`di hola`) no cuenta contra `BENCH_MAX_SPEND_USD`.
