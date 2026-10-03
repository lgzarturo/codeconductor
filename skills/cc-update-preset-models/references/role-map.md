# Role → effort → column defaults

Baseline when catalogs still match this generation. Re-validate against live
docs in the skill workflow; replace IDs, keep the three-tier shape.

## Roles

| Effort | Roles |
| ------ | ----- |
| high | architect, security-reviewer, devil, reviewer, contract-builder |
| medium | orchestrator, implementer, tester, complexity-auditor |
| low | task-coach, planner, goal-planner, repo-explorer, docs |

## Columns (shared source: src/presets/models/roles.yml)

| Column | high | medium (code / coord) | low |
| ------ | ---- | --------------------- | --- |
| `claude` | `claude-opus-5` | `claude-sonnet-5` | `claude-haiku-4-5-20251001` |
| `opencode` | architect / reviewer / contract-builder `opencode-go/deepseek-v4.1-flash`; security-reviewer / devil `opencode-go/glm-5.3-flash` | implementer / tester `opencode-go/mimo-v2.6-flash`; orchestrator `opencode-go/deepseek-v4.1-flash`; complexity-auditor `opencode-go/glm-5.3-flash` | task-coach / repo-explorer `opencode-go/glm-5.3-flash`; planner / goal-planner `opencode-go/deepseek-v4.1-flash`; docs `opencode-go/muse-spark-1.3-contributor` |
| `codex` | `gpt-5.6-sol` | `gpt-5.6-terra` | `gpt-5.6-luna` |
| `gemini` | `gemini-3.1-pro-preview` | `gemini-3.7-flash` | `gemini-3.7-flash` |
| `agy` | `gemini-3.1-pro-high` | `claude-sonnet-4-6` | `gemini-3.8-flash-medium` |
| `cursor` | `claude-opus-5-thinking-high` | implementer / tester / repo-explorer `composer-2.5-fast`; orchestrator `composer-2.5`; reviewer / complexity-auditor / contract-builder `claude-sonnet-5-thinking-high` | `claude-4.5-haiku-thinking` |
| `grok` | `cursor-grok-4.6-high-fast` on every role | same | same |
| `muse` | `muse-spark-1.3` on every role | same | same |

OpenCode default TUI (`presets/opencode/opencode.jsonc`): `opencode-go/deepseek-v4.1-flash`.

This project explicitly requests Muse Spark 1.3 Contributor for documentation.
It has regional restrictions and uses prompts for training; its retention is
not ZDR. This choice must not be generalized to other projects without checking
their requirements. All four OpenCode IDs were checked against the public Go
catalog and [Go documentation](https://opencode.ai/docs/go/) on 2026-09-25
(America/Cancun). The role assignment is a project recommendation, not a
provider benchmark. Keep provider sampling defaults: unknown reasoning
variants and generic temperature overrides can fail model resolution or be
ignored. See [V2 models](https://opencode.ai/v2/docs/models/).
