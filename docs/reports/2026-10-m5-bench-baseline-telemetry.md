# Auditoría de Telemetría y Pruebas de Benchmarking M5 (`bench-baseline.yml`)

> **Fecha:** 23 de octubre de 2026  
> **Alcance:** Auditoría técnica de las pruebas de regeneración de la baseline M5 cheap en GitHub Actions (`.github/workflows/bench-baseline.yml`), cubriendo los commits `65ed6f7..e3a2950` (Merge #24).  
> **Autor / Operador:** Antigravity / CodeConductor Council  
> **Directivas de Operación:** Arturo (22 de octubre de 2026, 9:51 Cancún)

---

## 1. Resumen Ejecutivo

Durante la fase de regeneración de la baseline M5 cheap, se identificó que la suite previa era inválida y susceptible a agotamiento silencioso de cuotas en OpenRouter. Para solventarlo sin incurrir en costos descontrolados ni loops infinitos de reintentos, se diseñó e implementó una infraestructura de telemetría **fail-closed** que incluye:

1. **Proxy local de peticiones OpenRouter** ([`openrouter-request-proxy.ts`](file:///home/algforge/work/codeconductor/src/core/evaluation/bench/openrouter-request-proxy.ts)) con tope estricto de 100 requests contables (POST a `/v1/messages` y `/v1/chat/completions`), token efímero local (`cc-proxy-local-*`), reescritura de ruta `/api` y rate-limiting de ventana deslizante (20 req/min) con espera en cola (sin 429).
2. **Candado de gasto estricto** ([`openrouter-spend-lock.ts`](file:///home/algforge/work/codeconductor/src/core/telemetry/openrouter-spend-lock.ts)) con verificación pre y post corrida vía `/api/v1/key`, tope de **$0.49 USD** para este repositorio ($0.99 USD acumulado global) y paro de emergencia al alcanzar el 90% del límite.
3. **Aislamiento y fijación del host Claude Code** ([`host-claude.ts`](file:///home/algforge/work/codeconductor/src/core/evaluation/bench/host-claude.ts)) fijado en `@anthropic-ai/claude-code@2.1.197` con reintentos desactivados (`CLAUDE_CODE_MAX_RETRIES=0` y `ANTHROPIC_MAX_RETRIES=0`).
4. **Mecanismo de compuerta Sonda vs Matrix** en [`.github/workflows/bench-baseline.yml`](file:///home/algforge/work/codeconductor/.github/workflows/bench-baseline.yml) con regla de paro estricta: si la celda de sonda baseline no alcanza éxito según el oráculo, se detiene la ejecución inmediatamente sin lanzar la matriz de 6 celdas.

Se auditaron y ejecutaron **7 corridas en GitHub Actions** distribuidas en dos campañas: la inicial con modelo Cohere y la definitiva con DeepSeek Flash.

---

## 2. Arquitectura de Control y Telemetría

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions Runner                           │
│                                                                        │
│  ┌──────────────────────┐              ┌────────────────────────────┐  │
│  │   Claude Code CLI    │              │ OpenRouter Request Proxy   │  │
│  │      (@2.1.197)      │              │    (127.0.0.1:ephemeral)   │  │
│  │                      │              │                            │  │
│  │ ANTHROPIC_AUTH_TOKEN │──POST msg───>│ • Valida token local       │  │
│  │  (cc-proxy-local-*)  │ (local hop)  │ • Incrementa contador (100)│  │
│  │                      │              │ • Rate limiter (20/min wait│  │
│  │ (Sin acceso a la key │              │ • Reescritura /api/v1      │  │
│  │   real upstream)     │<──SSE stream─│ • Inyecta OPENROUTER_KEY   │  │
│  └──────────────────────┘ (unbuffered) └─────────────┬──────────────┘  │
│                                                      │                 │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │ Upstream HTTPS
                                                       ▼
                                          ┌──────────────────────────┐
                                          │      openrouter.ai       │
                                          │   /api/v1/messages       │
                                          └──────────────────────────┘
```

### 2.1 Especificaciones Clave del Proxy
- **Persistencia en disco:** Archivo JSON con esquema `openrouter-request-counter/v1`, escrito atómicamente mediante archivo temporal + renombre (`fs.rename`). Si el archivo no puede leerse o escribirse, el proxy aborta de inmediato (*fail-closed*).
- **Semilla del contador (`BENCH_REQUESTS_ALREADY_USED`):** Permite acumular el presupuesto a través de diferentes ejecuciones en CI sin reiniciar a cero de manera arbitraria.
- **Rutas contables vs gratuitas:** Solo los POST dirigidos a `/v1/messages`, `/v1/chat/completions` consumen presupuesto. Llamadas `HEAD` y sondas de salud `/health` son libres de costo.
- **Rate Limiting:** Ventana rodante de 60 segundos limitada a 20 peticiones por minuto. A diferencia de un proxy convencional que responde con HTTP 429 (lo que induciría a Claude Code a ejecutar loops de reintento), este proxy suspende la petición en cola asíncrona hasta disponer de un cupo (timeout configurable de 180s).
- **Aislamiento de credenciales:** El subproceso de Claude Code se ejecuta con `ANTHROPIC_AUTH_TOKEN="cc-proxy-local-..."`. La variable `OPENROUTER_API_KEY` se purga estrictamente de su entorno de ejecución. El proxy verifica el token efímero y coloca la clave real únicamente en el salto saliente hacia OpenRouter.

---

## 3. Registro Detallado de Pruebas en GitHub Actions

A continuación se documentan las 7 ejecuciones realizadas sobre el workflow [`.github/workflows/bench-baseline.yml`](file:///home/algforge/work/codeconductor/.github/workflows/bench-baseline.yml):

### 3.1 Campaña 1: Modelo Cohere (`cohere/north-mini-code:free`)

| Run ID | Fecha / Hora | Intentos / Fase | Requests Consumidos | Gasto Δ (USD) | Veredicto / Estado | Causa Raíz y Hallazgo |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **[39777070216](https://github.com/lgzarturo/codeconductor/actions/runs/39777070216)** | 22-Oct-2026 | Smoke test inicial | 4 / 100 | $0.00 | **ABORT (NO CONCLUYENTE)** | Fallo en smoke test: Claude Code 2.1.308 rechazó el modelo con `unrecognized_model`. Se detectó incompatibilidad con versiones recientes de Claude Code. |
| **[39777659383](https://github.com/lgzarturo/codeconductor/actions/runs/39777659383)** | 22-Oct-2026 | Relaunch smoke (pinned 2.1.197) | 8 / 100 *(seed=4)* | $0.00 | **ABORT** | Claude Code se fijó a 2.1.197. El modelo continuaba listado en OpenRouter `:free`, pero el smoke arrojó `is_error=true`. |
| **[39778489974](https://github.com/lgzarturo/codeconductor/actions/runs/39778489974)** | 22-Oct-2026 | Path-fix relaunch | 10 / 100 *(seed=8)* | $0.00 | **ABORT** | Se corrigió `ANTHROPIC_BASE_URL` para incluir `/api`. Sin embargo, el endpoint devolvió errores en upstream para ese modelo gratuito. Se detuvieron los relanzamientos en Cohere. |
| **[39789258349](https://github.com/lgzarturo/codeconductor/actions/runs/39789258349)** | 22-Oct-2026 | Matriz N=3 parcial | 100 / 100 | $0.00000298 | **ABORT (Cap agotado)** | Probe y smoke pasaron exitosamente. Se ejecutaron 4 de 6 celdas (0/2 baseline y 0/2 treatment). Al alcanzar la petición 100, el proxy bloqueó la petición 101 con HTTP 403 y el runner abortó limpiamente bajo `request_budget_exhausted`. |

---

### 3.2 Campaña 2: Modelo DeepSeek Flash (`deepseek/deepseek-v4-flash`)

Tras la inestabilidad del tier `:free`, Arturo autorizó el uso de saldo de cuenta (~$10 USD disponible) con modelo de pago ultra-económico:
- **Modelo:** `deepseek/deepseek-v4-flash` ($0.091 / MTok prompt, $0.182 / MTok completion).
- **Presupuesto:** Contador reiniciado a 0/100 con candado de gasto en **$0.49 USD**.

| Run ID | Modalidad | Turns Configurados | Requests Consumidos | Gasto Δ (USD) | Veredicto / Resultado | Análisis Técnico |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **[39800247302](https://github.com/lgzarturo/codeconductor/actions/runs/39800247302)** | Sonda (1 celda) | `maxTurns=3` | 9 / 100 *(seed=0)* | $0.00 | **EXITOSO (`success=true`)** | Celda baseline completada y verificada por el oráculo. Consumió 9 POSTs. Veredicto formal: `NO CONCLUYENTE` debido a N=1 (< 3). Habilitó autorización para matriz. |
| **[39800579851](https://github.com/lgzarturo/codeconductor/actions/runs/39800579851)** | Matriz (6 celdas) | `maxTurns=3` *(accidental)* | 55 / 100 *(seed=9)* | +$0.056 | **RECHAZA (B: 3/3, T: 0/3)** | Ejecutó las 6 celdas completas. El brazo Baseline tuvo 3/3 éxitos, pero el brazo Treatment tuvo 0/3 éxitos debido a `error_max_turns` (3 turnos fueron insuficientes para completar el flujo con el harness). Consumió 46 peticiones (total acumulado: 55). |
| **[39801814203](https://github.com/lgzarturo/codeconductor/actions/runs/39801814203)** | Sonda (1 celda) | `maxTurns=6` | 60 / 100 *(seed=55)* | $0.00 | **FALLO DE COMPUERTA (`success=false`)** | Se ajustó `BENCH_MAX_TURNS=6` (basado en evidencia microsdd de 15/16 aciertos). El host Claude finalizó (`subtype=success`), pero el oráculo de la tarea determinó `success=false`. Consumió 5 peticiones. |

---

## 4. Análisis de la Regla de Paro (Sonda Gate)

El comportamiento de la corrida **39801814203** demostró la eficacia de los controles implementados:

```
                  ┌───────────────────────────────┐
                  │ Lanzamiento de Sonda (N=1)   │
                  │ maxTurns=6, seed=55           │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ Ejecución Celda Baseline:     │
                  │ Host: subtype=success         │
                  │ Oracle: success=false         │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                     ¿Oráculo evalúa SUCCESS?
                               / \
                              /   \
                         SÍ  /     \  NO
                            /       \
                           ▼         ▼
             ┌──────────────────┐  ┌─────────────────────────────────┐
             │ Autorizar Matriz │  │ ACTIVACIÓN DE STOP RULE:        │
             │     (2 × N=3)    │  │ • NO lanzar matriz              │
             │                  │  │ • Preservar 40 requests         │
             │                  │  │ • Detener gasto adicional       │
             └──────────────────┘  └─────────────────────────────────┘
```

### Hallazgos de Gobernanza:
1. **Contención de Costos:** Al fallar la sonda con 60/100 peticiones consumidas y $0.056 USD de gasto total en la campaña, la regla de paro evitó lanzar la matriz completa (que hubiera consumido entre 35 y 45 peticiones adicionales y potencialmente agotado el presupuesto).
2. **Consistencia de Artefactos:** Los resultados de las tres corridas de DeepSeek quedaron archivados de forma inmutable en:
   - [`eval/baselines/m5-cheap/sonda-39800247302/`](file:///home/algforge/work/codeconductor/eval/baselines/m5-cheap/sonda-39800247302/)
   - [`eval/baselines/m5-cheap/matrix-maxturns3-39800579851/`](file:///home/algforge/work/codeconductor/eval/baselines/m5-cheap/matrix-maxturns3-39800579851/)
   - [`eval/baselines/m5-cheap/sonda-maxturns6-39801814203/`](file:///home/algforge/work/codeconductor/eval/baselines/m5-cheap/sonda-maxturns6-39801814203/)
3. **Estado Actual:** El contador queda sembrado en **60 / 100** requests, con **40 requests restantes** y un remanente de gasto de **$0.434 USD** sobre el candado de $0.49 USD.
