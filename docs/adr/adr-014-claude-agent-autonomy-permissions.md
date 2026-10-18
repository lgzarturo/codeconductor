# ADR-014: Claude Preset Agent Autonomy Permissions

## Status

Accepted

## Context

The Claude preset (`presets/claude/settings.json`) listed `Bash(*)` and
`WebFetch(*)` under `permissions.ask`. Every shell command and web fetch
prompted the user, which interrupted multi-step workflows (`/fix`, `/feature`,
loop agent mode) and defeated the goal of agents that iterate until tests pass.

## Decision

Move `Bash(*)` and `WebFetch(*)` to `permissions.allow` and remove the `ask`
list. The preset now allows `Read(**)`, `Edit(**)`, `Bash(*)`, `WebFetch(*)`.

Safety does not rely on prompts. It relies on controls that are unchanged:

- `deny` blocks destructive and privileged commands (`rm -rf`, `sudo`,
  `git push --force`, `git reset --hard`, `git rebase`, `eval`, `curl | sh`,
  disk and service commands) and secret paths (`.env*`, `secrets/**`, keys,
  `~/.ssh`, `~/.aws`, `~/.gnupg`). `deny` takes precedence over `allow`.
- `Edit`/`Write` on `.codeconductor/**` stays denied.
- `defaultMode: "default"` and `disableBypassPermissionsMode: "disable"`.
- `PreToolUse` hook (`invoke-hook.cjs pre-tool`) evaluates Bash, PowerShell,
  Read, Write, Edit and MultiEdit against the policy; `PostToolUse` and
  `SessionStart` hooks are unchanged.

## Consequences

- Agents run shell and network steps without confirmation.
- Network access is unrestricted by the preset: a prompt-injected page could
  steer the agent to fetch or send data. Mitigation: secret reads are denied
  and the pre-tool hook still gates commands. Teams needing stricter handling
  should move `WebFetch(*)` back to `ask` in their own settings.
- Commands outside `deny` and the hook policy are no longer reviewed by a
  human. Extend `deny` rather than re-adding `ask` for specific risks.
- Tests assert this policy (`test/research-claude-install.test.ts`,
  `test/model-config.test.ts`). Changing it requires updating this ADR, per the
  rule "do not expand permissions in `settings.json` without documented
  justification".
- Existing installs are unaffected until the preset is reinstalled.
