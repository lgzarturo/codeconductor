# T-034 A/B (sin arnés / con arnés)

```bash
bun run ab:run -- --provider free|deepseek
bun run ab:run -- --provider free --dry-run
bun run ab:run -- --provider free --reset-counter   # reinicia el tope de campaña
```

5 tareas × N=5 × 2 brazos (pares barajados; dentro del par sin→con **o** con→sin), maxTurns≥6. Tope **total** fail-closed: 500 `:free` / 300 DeepSeek en `~/.cache/codeconductor-ab/counter-<provider>.json` (persiste entre `ab:run`; `--reset-counter` pone 0). Reporte en `~/.cache/codeconductor-ab/` o `--out`.

Costo live: usage Δ de OpenRouter `/api/v1/key` → `real`; si falla, suma `costUsd` del host → `estimado`; si no hay datos → `desconocido` (dry-run siempre desconocido).

Claves: solo `OPENROUTER_API_KEY`. Causa raíz M5 Invalid: workdir sin trust; ahora `trustClaudeWorkspace` + fingerprint en dry-run.
