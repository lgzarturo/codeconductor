# Agent hooks (OS-agnostic)

Agent PreToolUse / PostToolUse / SessionStart hooks call Node, not bash.

| OS | How it runs |
| --- | --- |
| Linux / macOS / Windows | `node .claude/hooks/invoke-hook.cjs <event>` or `node .agents/scripts/invoke-hook.cjs <event> --format=agy` |
| This repo | invoke-hook finds `bun` and runs `src/cli/main.ts hook` |
| Installed package | `node node_modules/cc-codeconductor/dist/index.js hook` |

Git pre-commit `GATE.md` scripts still use Git Bash on Windows. Agent hooks do
not.

## Events

| Event | CLI | Effect |
| --- | --- | --- |
| `pre-tool` | `bun run dev hook pre-tool` | Deny secrets, force-push, `reset --hard`, `rm -rf *`, `curl \| sh` |
| `post-tool` | `bun run dev hook post-tool` | Best-effort prettier/eslint/ruff if present |
| `session-start` | `bun run dev hook session-start` | Prints skill / OpenSpec / scorecard hints |

Claude: deny → stderr + exit 2. Agy: JSON `{ "action": "deny", "error": "…" }`.

## Privacy (OpenCode Go)

Do not assign `opencode-go/muse-spark-1.2-contributor` to a production role
(trains on prompts). `opencode-go/ox-alpha-free` is not in the official Go
catalog — optional fallback only.
