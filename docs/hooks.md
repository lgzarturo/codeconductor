# Agent hooks (OS-agnostic)

Agent PreToolUse / PostToolUse / SessionStart hooks call Node, not bash.

| OS | How it runs |
| --- | --- |
| Linux / macOS / Windows | `node .claude/hooks/invoke-hook.cjs <event>` or `node .agents/scripts/invoke-hook.cjs <event> --format=agy` |
| This repo (unreleased behavior) | With `CC_DEV=1`, invoke-hook finds `bun` and runs `src/cli/main.ts hook` after checking the package name |
| Installed package | `node node_modules/cc-codeconductor/dist/index.js hook` |

Git pre-commit `GATE.md` scripts still use Git Bash on Windows. Agent hooks do
not.

## Events

| Event | CLI | Effect |
| --- | --- | --- |
| `pre-tool` | `bun run dev hook pre-tool` | Deny secrets, force-push, `reset --hard`, `rm -rf *`, `curl \| sh` |
| `post-tool` | `bun run dev hook post-tool` | Best-effort prettier/eslint/ruff if present |
| `session-start` | `bun run dev hook session-start` | Prints skill / OpenSpec / scorecard hints |

Claude reads `tool_name` and `tool_input` from stdin. Deny → stderr + exit 2;
ask → `hookSpecificOutput.permissionDecision: "ask"` with exit 0.
Muse speaks the same protocol over `--format=muse`: identical stdin fields,
exit codes, and `ask` output.
Antigravity reads `toolCall.name` and `toolCall.args`, returning JSON
`{ "decision": "deny", "reason": "…" }` or `decision: "allow" / "ask"`.
See [Claude hooks](https://code.claude.com/docs/en/hooks) and
[Antigravity hooks](https://antigravity.google/docs/hooks/).

The wrapper buffers stdin once and replays it to every fallback runner. It
resolves the installed local package via Node and installed global npm
entrypoints from PATH without `npx` or Windows `.cmd` shims. In the unreleased
checkout, project-local source/build execution requires `CC_DEV=1` and a
`package.json` declaring `cc-codeconductor`; source via Bun is tried first in
that development mode. Arbitrary consumer source/build paths are not fallback
runners. Node must be on PATH.
Prettier and ESLint run through project-local JS entrypoints; missing optional
formatters are skipped, with a five-second timeout per formatter.

Windows drive paths, quoted `git.exe` paths, PowerShell Git invocation, Git
global options, and command chains are covered by policy tests. Absolute or
wildcard recursive Windows deletions (`Remove-Item`, `rd`, `del`) are denied.
`.env` paths are denied except `.env.example`, which stays readable so agents
can see the expected variable shape without real secrets.
These checks are guardrails, not a full shell parser or security sandbox.

## Failure behavior and per-project scope

- **Fail-Open Policy**: If `cc-codeconductor` is not installed or cannot execute (e.g. runner error, timeout, missing binary), `invoke-hook.cjs` fails open:
  - `agy`: Outputs `{"decision":"allow"}` (for `pre-tool`) or `{}` (for `post-tool` / `session-start`) with exit status 0. The agent is never blocked.
  - `claude` / `muse`: Exits with status 0.
- **Opt-in fail-closed (implemented, unreleased)**: `CC_HOOK_FAIL_CLOSED=1`
  or the wrapper flag `--fail-closed` denies `pre-tool` when the runner is
  unavailable, errors, or times out. Claude/Muse exit 2; Agy returns deny JSON
  with exit 0. Post-tool and session-start remain non-blocking.
- **Operational diagnosis (implemented, unreleased)**: session-start warns on
  stderr when the guard is unavailable. `doctor` probes the runner and reports
  `hook-runner` as pass or warn; installation state alone does not prove the
  guard is operational. `--check` on the wrapper returns operational status.
- **Child Process Timeout**: All hook strategy child processes time out after
  10,000 ms (10 seconds), using the configured failure behavior.
- **Per-Project Scope**: `agy/hooks.json` and `agy/scripts` specify `globalStrategy: skip` in the manifest. Hooks and scripts are only installed into project repositories (`.agents/hooks.json` and `.agents/scripts/`), never globally (`~/.gemini/config/`).

For a trusted development checkout, the explicit probe is:

```bash
CC_DEV=1 bun run dev doctor
```

Consumer projects should install the package and probe without `CC_DEV`.
These hooks provide guardrails; the target runtime owns OS isolation. See
[changes after v1.6.1](post-v1.6.1.md#resolución-del-runner-y-protección-de-hooks).

## Privacy (OpenCode Go)

The requested preset assigns `opencode-go/muse-spark-1.3-contributor` to docs.
It uses prompts/completions for training, is not ZDR, and has regional limits;
do not send confidential material. Use another verified model when necessary.
See [OpenCode Go privacy](https://opencode.ai/docs/go/#privacy).
