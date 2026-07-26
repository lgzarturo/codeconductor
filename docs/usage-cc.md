# Guía de uso local — CodeConductor CLI

Esta guía documenta cómo **validar localmente** los comandos de CodeConductor
sin publicar el paquete npm. Es el complemento de desarrollo de
[`usage-cli.md`](usage-cli.md) (instalación y `npx`) y de
[`cc-commands.md`](cc-commands.md) (referencia completa).

## Convención de ejecución

Desde la raíz del repositorio:

```bash
# Forma recomendada (script dev en package.json)
bun run dev <comando> [opciones]

# Equivalente directo
bun run src/cli/main.ts <comando> [opciones]

# Alias útil para sesiones de prueba
export CC='bun run dev'
$CC goal "Add user authentication"
```

| Producción (`npx`) | Desarrollo local (`bun run dev`) |
| ------------------ | -------------------------------- |
| `npx cc-codeconductor seo audit --url …` | `bun run dev seo audit --url …` |
| `npx cc-codeconductor goal "…"` | `bun run dev goal "…"` |
| `npx cc-codeconductor ccep parse …` | `bun run dev ccep parse …` |

---

## Prerrequisitos

| Grupo | Requisito |
| ----- | --------- |
| General | Bun instalado, `bun install`, cwd = raíz del repo |
| Tests | `bun test` — baseline actual: **1259 tests** |
| `init` / scorecard | `bun run dev init` (idempotente; crea `.codeconductor/evaluation/`) |
| `openspec` | `BACKLOG.md` en el cwd — copiar el fixture: `cp test/fixtures/backlog/BACKLOG.md .` |
| `scorecard create --from-diff` | Repositorio git con cambios (staged o unstaged) |
| `seo` | Acceso a red (URLs públicas) |

### Setup rápido (una vez por sesión)

```bash
bun install
bun run dev init
cp test/fixtures/backlog/BACKLOG.md .
```

---

## SEO

Comandos que requieren red. `example.com` es suficiente para smoke tests básicos.

### Auditar una URL

```bash
bun run dev seo audit --url https://example.com
```

**Qué hace:** ejecuta checks SEO (meta, canonical, headings, etc.) sobre una página.

**Salida esperada:**
- Exit code: `0` (aunque haya errores de SEO en la página; el CLI reporta hallazgos)
- Formato CLI por defecto: resumen con score, passed/warnings/errors
- Con `--format json`: objeto JSON con `target`, `timestamp`, `pages[]`, `checks[]`

```bash
bun run dev seo audit --url https://example.com --format json
```

### Auditar un sitemap

```bash
bun run dev seo audit --sitemap https://example.com/sitemap.xml
```

**Salida esperada:** reporte CLI con páginas auditadas. Nota: el sitemap de
`example.com` puede devolver **0 páginas**; el comando sigue siendo válido como
smoke test de conectividad y parsing.

### Auditar sitemap en Markdown

```bash
bun run dev seo audit --sitemap https://example.com/sitemap.xml --format markdown
```

**Salida esperada:**
- Exit code: `0`
- Archivo guardado en `seo-reports/audit-report-<timestamp>.md`
- Mensaje: `Report saved to: …/seo-reports/audit-report-….md`

### Generar llms.txt desde sitemap

```bash
bun run dev seo llms --sitemap https://example.com/sitemap.xml
```

**Salida esperada:**
- Exit code: `0`
- Archivo `llms.txt` en el cwd (puede tener 0 entradas si el sitemap está vacío)
- Mensaje: `Generated: …/llms.txt (N entries)`

### Generar llms.txt desde URL con salida explícita

```bash
bun run dev seo llms --url https://example.com --output llms.txt
```

**Salida esperada:**
- Exit code: `0`
- Archivo `llms.txt` con título, descripción y enlaces extraídos
- Ejemplo de contenido: `# Example Domain` con sección `## Main Pages`

**Fallos comunes:**
- Sin red → timeout o error de fetch
- Falta `--url` y `--sitemap` → exit `1`, error: `Either --url or --sitemap is required`

---

## Goal / cc-goal

Planificación determinística de objetivos en grafo de tareas YAML.

### goal

```bash
bun run dev goal "Add user authentication"
```

**Salida esperada:**
- Exit code: `0`
- Árbol de dependencias impreso en consola (p. ej. `auth-schema` → `auth-api` → `auth-impl` → `auth-tests`)
- Archivo: `.codeconductor/current-goal.yml`

### cc-goal (alias)

```bash
bun run dev cc-goal "Implement CRUD for invoices"
```

**Salida esperada:** mismo formato que `goal`; sobrescribe
`.codeconductor/current-goal.yml` con tareas `crud-model` → `crud-service` →
`crud-api` → `crud-tests`.

**Verificación:**

```bash
cat .codeconductor/current-goal.yml
# Debe contener objective, tasks[], depends_on[], created_at
```

---

## CCEP (CodeConductor Execution Protocol)

Ver especificación completa en [`ccep-1.md`](ccep-1.md).

### parse — envelope estructurado

```bash
bun run dev ccep parse --command fix "login fails"
bun run dev ccep parse --command fix "login fails" --output json
```

**Salida esperada (JSON):**
- `success: true`
- `envelope.protocolVersion: "ccep-1"`
- `envelope.command: "fix"`
- `envelope.userRequest: "login fails"`

### profile — workflow profile

```bash
bun run dev ccep profile council --output json
```

**Salida esperada:**
- `profile.id: "council"`
- `profile.phases[]` con agentes (`task-coach`, `architect`, etc.)

### resolve — contexto de ejecución completo

```bash
bun run dev ccep resolve --command feature "Add CRUD" --output json
```

**Salida esperada:**
- `context.envelope`, `context.profile`, `context.intent`, `context.project`
- `constraints.needConfirmation: true` para feature

### compile — prompt de 7 capas

```bash
bun run dev ccep compile --command feature "Add CRUD" --phase intake --output json
```

**Salida esperada:**
- `success: true`
- `phase: "intake"`, `role: "task-coach"`, `outputSchema: "planner-output"`
- `promptVersion: "v0.6.0"`
- `layers[]` (system, agent, policies, knowledge, ast, task, output_schema)
- `prompt` — texto compilado listo para el agente

**Fases válidas (feature):** `intake`, `design`, `implement`, `test`, `review`, `docs`.
Usar `--phase plan` falla con `Unknown phase: plan`.

### validate — validar salida de agente

```bash
bun run dev ccep validate --command feature --phase implement --role implementer \
  '{"status":"success","confidence":0.9,"warnings":[],"artifacts":[],"next_actions":[],"filesChanged":[{"path":"src/a.ts","summary":"change"}],"tests":{"runner":"bun test","result":"passed"}}' \
  --output json
```

**Salida esperada (payload válido):**
- `valid: true`, exit code `0`
- `schema: "implementer-output"`

**Payload inválido:** exit code `1`, `valid: false`, array `errors` con detalle Zod.

**Notas:**
- Usar JSON inline al final del comando, o `--input @ruta/archivo.json`
- No existe flag `--payload`; `--input` o posicional JSON

---

## OpenSpec

Requiere `BACKLOG.md` en el cwd (ver setup).

### validate

```bash
bun run dev openspec validate
bun run dev openspec validate --output json
```

**Salida esperada (JSON):**
```json
{
  "success": true,
  "valid": true,
  "itemCount": 1,
  "errors": [],
  "recommendations": []
}
```

### scan

```bash
bun run dev openspec scan --output json
```

**Salida esperada:** `modifiedItems`, `newItems`, `closedItems`, `contentHash`.

### plan

```bash
bun run dev openspec plan BC-001
```

**Salida esperada:**
- Exit code: `0`
- Crea artefactos en `openspec/changes/bc-001-first-backlog-item/` (proposal, tasks, specs)

### status

```bash
bun run dev openspec status --output json
```

**Salida esperada:**
- `activeItemId: "BC-001"`
- `taskCardsPending`, `changePaths`

### next

```bash
bun run dev openspec next --output json
```

**Salida esperada:**
- `taskCard` con `id`, `phase`, `agent`, `prompt`, `dependsOn`, `status: "pending"`

**Fallos comunes:**
- Sin `BACKLOG.md` → error de validación
- `BC-999` inexistente → error al planificar

---

## Scorecard

Requiere `bun run dev init` para `.codeconductor/evaluation/`.

### create

```bash
bun run dev scorecard create --task BC-001 --from-diff
bun run dev scorecard create --task BC-001 --from-diff --output json
```

**Salida esperada (JSON):**
- `scorecard.id` (p. ej. `sc-ms25f2zi-xdhp`)
- `scorecard.taskId: "BC-001"`
- `criteria[]` con scores y `autoSuggested` cuando aplica diff
- Archivo persistido en `.codeconductor/evaluation/scorecards/<id>.json`

### models

```bash
bun run dev scorecard models --output json
```

**Salida esperada:** `profile`, `phases[]` con `agent`, `model`, `modelKey`.

### aggregate

```bash
bun run dev scorecard aggregate --output json
```

**Salida esperada:**
- `total`, `passRate`, `avgWeightedScore`, `byAgent`, `byModel`
- Valores en `0` si no hay outcomes registrados aún

---

## Help

### OpenCode

```bash
bun run dev help --target opencode
```

**Salida esperada:** lista de comandos CLI (init, detect, install, seo, goal, ccep, openspec, scorecard, etc.).

### Claude (JSON)

```bash
bun run dev help --target claude --output json
```

**Nota:** el CLI imprime el encabezado de ayuda en stdout; use `--output json` para
integraciones que consuman la salida estructurada del subcomando.

---

## Checklist de validación end-to-end

Orden recomendado (~5–10 min):

```bash
# 1. Suite de tests
bun test

# 2. Setup
bun run dev init
cp test/fixtures/backlog/BACKLOG.md .

# 3. Offline
bun run dev goal "Add user authentication"
bun run dev cc-goal "Implement CRUD for invoices"
bun run dev ccep parse --command fix "login fails" --output json
bun run dev ccep profile council --output json
bun run dev ccep resolve --command feature "Add CRUD" --output json
bun run dev ccep compile --command feature "Add CRUD" --phase intake --output json
bun run dev openspec validate --output json
bun run dev openspec scan --output json
bun run dev openspec plan BC-001
bun run dev openspec status --output json
bun run dev openspec next --output json
bun run dev scorecard create --task BC-001 --from-diff --output json
bun run dev scorecard models --output json
bun run dev scorecard aggregate --output json
bun run dev help --target opencode
bun run dev help --target claude --output json

# 4. Con red (opcional)
bun run dev seo audit --url https://example.com
bun run dev seo audit --sitemap https://example.com/sitemap.xml
bun run dev seo audit --sitemap https://example.com/sitemap.xml --format markdown
bun run dev seo llms --sitemap https://example.com/sitemap.xml
bun run dev seo llms --url https://example.com --output llms.txt
```

**Criterio de éxito:** todos los comandos offline con exit code `0`; SEO con red
accesible.

---

## Artefactos generados y limpieza

Los smoke tests dejan archivos **no versionados**. No los commitees.

| Artefacto | Origen | Limpieza |
| --------- | ------ | -------- |
| `.codeconductor/current-goal.yml` | `goal` / `cc-goal` | `rm .codeconductor/current-goal.yml` |
| `.codeconductor/evaluation/scorecards/*.json` | `scorecard create` | borrar archivos de prueba |
| `.codeconductor/openspec-state.json` | `openspec plan` | regenerable con `init` |
| `openspec/changes/` | `openspec plan` | `rm -rf openspec/changes/` |
| `BACKLOG.md` (copiado del fixture) | setup manual | `rm BACKLOG.md` si no es del proyecto |
| `llms.txt` | `seo llms` | `rm llms.txt` |
| `seo-reports/` | `seo audit --format markdown` | `rm -rf seo-reports/` |

```bash
# Limpieza opcional post-smoke-test
rm -f llms.txt BACKLOG.md .codeconductor/current-goal.yml
rm -rf seo-reports/ openspec/changes/
```

---

## Referencias

- [CCEP-1 — Protocolo de ejecución](ccep-1.md)
- [Usage CLI (npx / empaquetado)](usage-cli.md)
- [Referencia de comandos](cc-commands.md)
- Fixture de backlog: [`test/fixtures/backlog/BACKLOG.md`](../test/fixtures/backlog/BACKLOG.md)
