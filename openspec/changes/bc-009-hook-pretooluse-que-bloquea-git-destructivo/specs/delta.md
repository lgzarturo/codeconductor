# Delta Spec: Hook PreToolUse que bloquea git destructivo

## ADDED Requirements

- El hook bloquea git push y git reset --hard con exit code 2
- El mensaje de bloqueo indica que el agente no tiene autoridad sobre esos comandos
- La lista de patrones bloqueados es editable por el usuario del preset
