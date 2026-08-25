# Proposal: Router /cc:ask que recomienda el slash command correcto

## Why

Portar ask-matt como router de baja prioridad que, dado un problema en lenguaje natural, recomienda el slash command adecuado entre feature, fix, refactor, review, tdd-cycle y openspec.



## What Changes

- Definir /cc:ask apoyado en /cc:help con el catálogo de flujos.

## Capabilities

- **New Capabilities:** deterministic `ask` CLI + `/cc:ask` slash command that recommends one of six catalog flows
- **Modified Capabilities:** CLI `--help` lists `ask`

**Out of scope:** Ejecutar automáticamente el flujo recomendado sin confirmación humana.

## Impact

See design.md for technical impact.

**Out of scope:** Ejecutar automáticamente el flujo recomendado sin confirmación humana.
