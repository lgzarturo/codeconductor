# Role → effort → column defaults

Baseline when catalogs still match this generation. Re-validate against live
docs in the skill workflow; replace IDs, keep the three-tier shape.

## Roles

| Effort | Roles |
| ------ | ----- |
| high | architect, security-reviewer, devil, reviewer, contract-builder |
| medium | orchestrator, implementer, tester, complexity-auditor |
| low | task-coach, planner, goal-planner, repo-explorer, docs |

## Columns (cross-preset, identical in all six YAML files)

| Column | high | medium (code / coord) | low |
| ------ | ---- | --------------------- | --- |
| `claude` | `claude-opus-5` | `claude-sonnet-5` | `claude-haiku-4-5-20251001` |
| `opencode` | `opencode-go/deepseek-v4-pro` | implementer `opencode-go/mimo-v2.5-pro`; tester `opencode-go/minimax-m3`; other medium `opencode-go/qwen3.7-plus` | intake `opencode-go/kimi-k2.7-code`; explore/plan `opencode-go/deepseek-v4-flash`; docs `opencode-go/qwen3.7-plus` |
| `codex` | `gpt-5.6-sol` | `gpt-5.6-terra` | `gpt-5.6-luna` |
| `gemini` / `agy` | `gemini-3.1-pro-preview` | `gemini-3.7-flash` | `gemini-3.7-flash` |
| `cursor` | `claude-opus-5-thinking-high` | implementer / tester / repo-explorer `composer-2.5-fast`; orchestrator `composer-2.5`; reviewer / complexity-auditor / contract-builder `claude-sonnet-5-thinking-high` | `claude-4.5-haiku-thinking` |
| `grok` | `cursor-grok-4.6-high-fast` on every role | same | same |

OpenCode high for **reviewer** and **contract-builder** stays on `qwen3.7-plus`
unless live docs justify `qwen3.8-max` (cost).

`agy:` duplicates `gemini:` on every role.
