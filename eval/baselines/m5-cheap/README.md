# M5 cheap baseline (OpenRouter)

> Arturo **22 Oct 9:51** + maxTurns=6 (microsdd). Claude Code **2.1.197**.

> **No comparables con corridas nuevas.** Estas baselines usan el prompt sin
> enriquecer (sin scope ni criterios) y un treatment sin workspace confiable
> (permisos del arnés ignorados). Ver `docs/post-v1.8.0.md` §7.

## Model

- **`deepseek/deepseek-v4-flash`** — **$0.091 / MTok prompt**, **$0.182 / MTok completion**

## Caps

| Cap | Value |
| --- | --- |
| Requests | **100** (reset); now **60 / 100** after sonda#2 |
| Spend | **$0.49** usage Δ; campaign Δ so far ≈ **$0.056** (matrix-3) + **$0** (sondas) |
| maxTurns | **6** |
| Proxy | POST-only count; rpm wait; budget 403; MAX_RETRIES=0 |

## Sonda maxTurns=6 — [39801814203](https://github.com/lgzarturo/codeconductor/actions/runs/39801814203)

| | |
| --- | --- |
| Cell | baseline rep1 — host OK (`subtype=success`) but **oracle success=false** |
| Requests | **60 / 100** (seed 55 + 5) |
| Usage Δ | **$0** |
| Gate | **FAIL** → **matrix NOT run** (Arturo stop rule) |

## Other runs

- Sonda maxTurns=3 [39800247302](https://github.com/lgzarturo/codeconductor/actions/runs/39800247302): success=true (9 req)
- Accidental matrix maxTurns=3 [39800579851](https://github.com/lgzarturo/codeconductor/actions/runs/39800579851): B 3/3 T 0/3 **RECHAZA**, 55 req, Δ+$0.056

## Treatment Invalid (root cause)

Matrix treatment stderr: `Ignoring N permissions.allow … workspace has not been trusted` — preset on disk but not applied. Fixed by the isolated `CLAUDE_CONFIG_DIR` that trusts the cell cwd (`prepareIsolatedClaudeConfig`); T-034 adds `bun run ab:run -- --dry-run` to prove it. See `eval/ab/README.md`.
