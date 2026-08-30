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
| `opencode` | architect `opencode-go/deepseek-v4-pro`; security-reviewer `opencode-go/kimi-k3`; devil `opencode-go/glm-5.3`; reviewer / contract-builder `opencode-go/qwen3.8-max` | implementer `opencode-go/mimo-v2.5`; tester `opencode-go/minimax-m3`; orchestrator `opencode-go/qwen3.7-plus`; complexity-auditor `opencode-go/glm-5.3` | intake `opencode-go/gpt-5.6-luna`; goal-planner `opencode-go/deepseek-v4-flash`; repo-explorer `opencode-go/longcat-2.0`; docs `opencode-go/hy3` |
| `codex` | `gpt-5.6-sol` | `gpt-5.6-terra` | `gpt-5.6-luna` |
| `gemini` / `agy` | `gemini-3.1-pro-preview` | `gemini-3.7-flash` | `gemini-3.7-flash` |
| `cursor` | `claude-opus-5-thinking-high` | implementer / tester / repo-explorer `composer-2.5-fast`; orchestrator `composer-2.5`; reviewer / complexity-auditor / contract-builder `claude-sonnet-5-thinking-high` | `claude-4.5-haiku-thinking` |
| `grok` | `cursor-grok-4.6-high-fast` on every role | same | same |

OpenCode default TUI (`presets/opencode/opencode.jsonc`): `opencode-go/qwen3.7-plus`.

Do not assign `opencode-go/muse-spark-1.2-contributor` to a production role
(trains on prompts; not ZDR). `opencode-go/ox-alpha-free` is not in the official
Go catalog — leave it as an optional fallback, never a default role slug.

`agy:` duplicates `gemini:` on every role.
