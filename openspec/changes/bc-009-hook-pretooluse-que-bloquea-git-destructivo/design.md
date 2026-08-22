# Design: Hook PreToolUse que bloquea git destructivo

## Approach

(To be completed in design phase.)

## Files Affected

Script de guardrail y wiring en presets/**/hooks.json; materializa la regla de no push directo desde agentes.

## Acceptance Criteria

- El hook bloquea git push y git reset --hard con exit code 2
- El mensaje de bloqueo indica que el agente no tiene autoridad sobre esos comandos
- La lista de patrones bloqueados es editable por el usuario del preset
