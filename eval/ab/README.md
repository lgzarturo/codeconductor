# T-034 A/B (sin arnés / con arnés)

Comando (desde la raíz del repo):

```bash
bun run ab:run -- --provider free|deepseek
# dry-run (sin red / sin gastar requests):
bun run ab:run -- --provider free --dry-run
```

Qué hace: 5 tareas × N=5 × 2 brazos (A/B intercalado), maxTurns≥6, tope fail-closed (500 `:free` / 300 DeepSeek vía proxy POST-only), reporte en `~/.cache/codeconductor-ab/` (o `--out`).

Claves: solo `OPENROUTER_API_KEY` en el entorno. No las pegues en logs/PRs.

Causa raíz M5 Invalid: el workdir temporal no estaba trusted → Claude ignoraba `permissions.allow` del preset; el runner ahora marca trust + verifica fingerprint en dry-run.
