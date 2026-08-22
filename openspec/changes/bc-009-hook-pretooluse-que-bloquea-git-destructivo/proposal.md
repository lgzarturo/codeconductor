# Proposal: Hook PreToolUse que bloquea git destructivo

## Why

Portar git-guardrails-claude-code como hook PreToolUse sobre Bash que intercepta y bloquea git push, reset --hard, clean -f, branch -D y checkout/restore de árbol, con exit code 2.



## What Changes

- Script de guardrail y wiring en presets/**/hooks.json; materializa la regla de no push directo desde agentes.

## Capabilities

- **New Capabilities:** (to be refined in design phase)
- **Modified Capabilities:** (to be refined in design phase)

## Impact

See design.md for technical impact.

**Out of scope:** Bloquear comandos no relacionados con git.
