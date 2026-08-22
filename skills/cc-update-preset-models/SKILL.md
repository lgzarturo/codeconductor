---
name: cc-update-preset-models
description: >
  Updates CodeConductor preset agent model slugs in src/presets/models/,
  keeps all six YAML files consistent, and patches model-config tests.
  Use when the user asks to refresh available models, bump OpenCode Go /
  Claude / Codex / Gemini / Cursor / Grok IDs, sync preset model maps, or
  runs /cc-update-preset-models or /cc:update-preset-models. This repo only
  — not a consumer workflow.
license: Apache-2.0
metadata:
  author: lgzarturo
  version: "1.0"
---

# cc-update-preset-models

Mantiene los IDs de modelo que `install preset` escribe en `model:` y en las
tablas `{{MODEL_*}}`. Ejecutar cuando cambien los catálogos de los runners.

## When NOT to Use

- Proyecto consumidor (no hay `src/presets/models/` de este producto)
- Copiar esta skill a `presets/`, CCEP, routing, o el npm package
- Cambiar contratos de prompts salvo que un test lo exija

## How install uses the YAML

[`src/core/presets/file-copier.ts`](../../src/core/presets/file-copier.ts)
`renderTemplate`: `model:` = columna del `target` (`opencode` | `claude` |
`codex` | `gemini` | `cursor` | `agy`). El resto rellena `{{MODEL_CLAUDE}}`,
`{{MODEL_OPENCODE}}`, `{{MODEL_CODEX}}`, `{{MODEL_GEMINI}}`, `{{MODEL_CURSOR}}`,
`{{MODEL_GROK}}`.

Las **seis** YAMLs deben compartir las mismas columnas cruzadas. Solo
[`agy.yml`](../../src/presets/models/agy.yml) añade `agy:` (copia de `gemini:`).
La columna `cursor:` son **slugs de Cursor**, nunca IDs de GPT.

Archivos: `src/presets/models/{opencode,claude,codex,gemini,cursor,agy}.yml`

## Workflow

Copia este checklist y márcalo:

```
- [ ] 1. Fuentes vivas
- [ ] 2. Mapa high/medium/low
- [ ] 3. Escribir las 6 YAMLs (columnas idénticas)
- [ ] 4. Tests + CHANGELOG
- [ ] 5. Verificar
```

### 1. Fuentes vivas

Consultar **hoy** (no memorizar IDs):

| Runner | Fuente |
| ------ | ------ |
| OpenCode Go | https://opencode.ai/docs/go/ y `curl https://opencode.ai/zen/go/v1/models` |
| Claude API / Claude Code | https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions |
| Codex | https://developers.openai.com/codex/models |
| Gemini | https://ai.google.dev/gemini-api/docs/deprecations y docs de models |
| Cursor | slugs que el IDE acepta en subagents (`claude-*-thinking-*`, `composer-*`, `cursor-grok-*`, `gpt-5.6-*-medium`, `gemini-*-flash-high`) |
| Grok (fallback Cursor) | el `cursor-grok-*-high-fast` más reciente listado en Cursor |

Descartar IDs deprecados, preview solo si no hay estable equivalente (p. ej.
Gemini Pro). No inventar slugs.

### 2. Mapa por esfuerzo

Leer `effort:` en `presets/opencode/agents/*.md`. Tabla canónica:
[references/role-map.md](references/role-map.md).

Ajustar el mapa si el catálogo cambió de familia; conservar **tres niveles**
(high / medium-code / low).

### 3. Escribir YAML

1. Construir un dict de 14 roles con las 6 columnas (`claude`, `opencode`,
   `codex`, `gemini`, `cursor`, `grok`).
2. Copiarlo a los seis archivos; preservar `permissions:` (opencode) y
   `tools:` (el resto). En agy, `agy:` = `gemini:`.
3. Conservar el comentario de cabecera de cada archivo.
4. No mezclar slugs: Claude CLI = IDs API (`claude-opus-5`); Cursor =
   `claude-opus-5-thinking-high`.

### 4. Tests y changelog

Actualizar asserts en [`test/model-config.test.ts`](../../test/model-config.test.ts)
que fijan slugs (`architect`/`implementer`/`tester`, grok, install e2e
claude/codex/gemini/cursor/opencode). Si
[`test/prompt-v050.test.ts`](../../test/prompt-v050.test.ts) renderiza Grok
con `loadModelConfig('cursor')`, alinear el expect.

Añadir una viñeta en `CHANGELOG.md` Unreleased (Changed).

No commitear salvo que el usuario lo pida.

### 5. Verificar

```bash
bun test test/model-config.test.ts test/prompt-v050.test.ts test/cursor-preset.test.ts
```

Grep en `src/presets/models/` de slugs que acabas de retirar. Si el grep
sigue encontrándolos, el YAML no está limpio.

Tras editar código: `graphify update .`

## Local CLI

`bun run dev` — nunca `npx cc-codeconductor` en este repo.

## Deliverable

En el chat: tabla breve rol → slug **nativo** por target (`opencode` /
`claude` / `codex` / `gemini` / `cursor` / `agy`). Listar IDs descartados y
por qué (deprecado, China-opt-in, no es slug del runner).
