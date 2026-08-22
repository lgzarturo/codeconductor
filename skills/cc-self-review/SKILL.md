---
name: cc-self-review
description: >
  Revisión interna del producto CodeConductor (seguridad, implementación,
  flujo de trabajo, funcionalidades y modelo mental). Solo para iterar este
  repositorio — no forma parte del flujo instalable.
  Trigger: /cc-self-review, /cc:self-review, o cuando el usuario pide
  auto-revisar CodeConductor, auditar el producto, o construir un mental model
  del codebase propio.
license: Apache-2.0
metadata:
  author: lgzarturo
  version: "1.0"
---

## When to Use

- Revisar el **código fuente de este repo** (`src/`, `presets/`, `test/`, CLI)
- Auditar **seguridad** (SSRF, secretos, install overwrite, supply chain)
- Evaluar **implementación** contra YAGNI, stdlib-first y el stack Bun/TS
- Recomendar cambios de **flujo de trabajo** o **funcionalidades** del producto
- Construir o refrescar el **modelo mental** del Product Operating System
- Invocado vía `/cc-self-review` o `/cc:self-review`

## When NOT to Use

- Reviews de un proyecto consumidor (usar `/cc-review` / skill `cc-review`)
- Instalación de presets, CCEP, council, o routing de Conductor Agents
- Empaquetar esta skill en `presets/`, `src/presets/`, o el npm package

## Critical Patterns

### 1. Scope: producto interno, no workflow instalable

| Acción                                                   | Permitido                                   |
| -------------------------------------------------------- | ------------------------------------------- |
| Leer/analizar `src/`, `test/`, `docs/`, `presets/`       | Sí                                          |
| Editar código como parte de un follow-up Task Card       | Solo si el usuario lo pide después          |
| Añadir a `presets/cursor/`, CCEP profiles, routing table | **Nunca**                                   |
| Usar bootstrap CCEP (`ccep parse/resolve/profile`)       | **Nunca**                                   |
| Probar CLI local                                         | `bun run dev …` (no `npx cc-codeconductor`) |

Esta skill **no** es un Conductor Agent. No entra en la routing policy ni en
Scorecards de consumidores.

### 2. Stack del producto (modelo mental fijo)

| Capa              | Tecnología                                                |
| ----------------- | --------------------------------------------------------- |
| Runtime / tests   | Bun ≥1.0 (Node ≥20.11 compatible)                         |
| Lenguaje          | TypeScript (strict), ESM                                  |
| Validación        | Zod                                                       |
| Config            | YAML (`yaml` package) + `.codeconductor/`                 |
| Deps runtime      | Solo `zod` + `yaml` — stdlib-first                        |
| Distribución      | `presets/` + `dist/index.js` (ver `package.json` `files`) |
| Grafo de producto | `.codeconductor/product-graph.json`                       |
| Grafo de código   | `graphify-out/` (usar `graphify query/path/explain`)      |

### 3. Mapa mental del producto (4 planos)

```text
CLI (src/cli, src/commands)
  → Core (presets, loop, goal, memory, ccep, product-graph, complexity)
  → Domain (council, seo, lsp, product entities)
  → Adapters (opencode, claude, codex, cursor, agy, gemini)
  → Presets instalables (presets/*)  ← consumidores
```

Pregunta guía: ¿esto mejora el **producto** CodeConductor, o un **preset** para
terceros? Esta skill solo recomienda mejoras del producto.

### 4. Ejes de revisión (obligatorios)

Cada finding referencia **exactamente un eje**:

| Eje                | Qué buscar                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Security**       | SSRF, secret leak, path traversal en install/merge, command injection, unsafe `fetch`, overwrite destructivo, credenciales en fixtures |
| **Implementation** | Correctitud, límites de módulo, YAGNI, stdlib-first, tipos Zod, tests que fallan/destruyen archivos tracked                            |
| **Workflow**       | Gaps en loop (`intake→…→compact`), gates humanos, escalación, goal dependency order, CCEP vs comandos legacy                           |
| **Product**        | Claridad del mental model, solape de features, roadmap vs shipped, DX de `bun run dev`, docs desalineadas                              |
| **Features**       | Capacidades faltantes o sobredimensionadas; priorizar 80/20 para el maintainer                                                         |

Severidad: `CRITICAL` | `WARNING` | `SUGGESTION` | `QUESTION` (modelo mental).

### 5. Hotspots de seguridad (revisar siempre)

| Área              | Paths de referencia                                                 |
| ----------------- | ------------------------------------------------------------------- |
| SSRF / HTTP       | `src/infrastructure/http/safe-fetch.ts`, SEO audit/llms             |
| Secretos          | `src/core/filesystem/credential-guard.ts`, `policy.yml`             |
| Write safety      | `src/core/filesystem/safety.ts`, `safe-merger.ts`, `file-writer.ts` |
| Install overwrite | `src/presets/manifests/*.yml` (`strategy: overwrite`)               |
| CLI surface       | `src/cli/router.ts`, `src/commands/*.ts`                            |
| Supply chain      | `package.json` dependencies — resistir deps nuevas                  |

### 6. Salida: no implementar en silencio

1. Producir el **Self-Review Report** (plantilla en assets)
2. Separar hallazgos de **recomendaciones de producto** (flujo/features)
3. Incluir una sección **Mental Model** (cómo pensar el sistema hoy)
4. Si el usuario quiere cambios: proponer Task Cards — no editar hasta que lo
   pida

## Workflow

### Step 0 — Orientación

1. Confirmar cwd = repo `codeconductor` (este producto).
2. Si existe `graphify-out/graph.json`, correr:

   ```bash
   graphify query "CodeConductor architecture CLI core adapters presets"
   ```

3. Leer referencias locales listadas abajo (no inventar arquitectura).

### Step 1 — Acotar scope (`$ARGUMENTS`)

| Argumento                  | Scope                                                      |
| -------------------------- | ---------------------------------------------------------- |
| (vacío)                    | Diff actual + hotspots de seguridad + panorama de producto |
| `security`                 | Solo eje Security                                          |
| `product` / `mental-model` | Solo Product + Features + Workflow                         |
| `implementation`           | Solo Implementation (+ tests)                              |
| path/`src/...`             | Archivos o módulos concretos                               |
| `full`                     | Revisión amplia (usar subagentes en paralelo si aplica)    |

### Step 2 — Recolectar evidencia

```bash
git status
git diff HEAD
git log -10 --oneline
bun run typecheck
```

Para scope `full` o `implementation`, preferir tests acotados antes que
`bun test` completo si el suite es destructivo en fixtures.

### Step 3 — Analizar

Recorrer los 5 ejes (o el subset pedido). Cada finding:

```markdown
- **[SEVERITY][Eje]** `path/file.ts` — qué falla / qué falta
  - Evidencia: …
  - Recomendación: …
  - Esfuerzo: S | M | L
```

### Step 4 — Recomendaciones de flujo y features

Tabla priorizada (Impacto × Esfuerzo):

| Prioridad | Recomendación | Eje | Impacto | Esfuerzo |
| --------- | ------------- | --- | ------- | -------- |
| P0        | …             | …   | alto    | S/M/L    |

### Step 5 — Mental Model (obligatorio)

Entregar 8–15 viñetas que el maintainer pueda memorizar:

- Qué es CodeConductor en una frase
- Planos (CLI / Core / Domain / Adapters / Presets)
- Lo que ya shippea vs lo que es roadmap
- Invariantes (stdlib-first, managed sections, no force-push, human gates)
- Cómo se prueba en local (`bun run dev`)
- Qué **no** es (no runtime sandbox, no esta skill en presets)

### Step 6 — Report file (opcional)

Si el usuario lo pide, escribir:

`docs/internal/YYYY-MM-DD-cc-self-review.md`

usando [assets/report-template.md](assets/report-template.md).

## Code Examples

Finding bien formado:

```markdown
- **[CRITICAL][Security]** `src/commands/seo-audit.command.ts` —
  fetch sin `safeFetch` en un path de URL de usuario
  - Evidencia: llamada a `fetch(url)` sin validación DNS
  - Recomendación: reutilizar `safeFetch` de infrastructure/http
  - Esfuerzo: S
```

Recomendación de producto:

```markdown
| P1 | Documentar invariante: skills en `skills/` no van a presets |
| Product | alto | S |
```

## Commands

```bash
# Orientación
graphify query "CodeConductor CLI core product-graph security"
graphify explain "workflow loop"

# Evidencia
git diff HEAD
bun run typecheck
bun run dev help
bun run dev doctor

# Dev CLI (nunca npx para iterar este repo)
bun run dev seo audit --url https://example.com
bun run dev goal "…"
bun run dev ccep parse --command review "…" --output json
```

## Resources

- **Report template**: [assets/report-template.md](assets/report-template.md)
- **Command stubs**: [assets/commands/](assets/commands/) — restaurar si
  `install preset` pisa `.cursor/commands/`
- **Product map**: [references/product-map.md](references/product-map.md)
- **Architecture**: [docs/architecture.md](../../docs/architecture.md)
- **README scope**: [README.md](../../README.md)
- **Routing / agents**: [AGENTS.md](../../AGENTS.md) (sección managed ≠ esta
  skill)
