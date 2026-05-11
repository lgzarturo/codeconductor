# Preset Security Analysis

## Purpose

This document compares the Codex, OpenCode, and Claude presets from a security,
isolation, and safe execution perspective. It identifies framework-level
improvements that should become part of CodeConductor's policy model and future
CLI validation.

## Scope

Reviewed preset surfaces:

- `presets/codex/AGENTS.md`
- `presets/opencode/opencode.jsonc`
- `presets/opencode/agents/*.md`
- `presets/claude/CLAUDE.md`
- `presets/claude/settings.json`
- `policy.yml`
- `docs/security-model.md`
- `docs/guides/agent-user-isolation.md`

## Security Baseline

CodeConductor's current security posture is declarative. The framework defines
intended boundaries, but enforcement depends on the target tool until a policy
compiler and runtime layer exist.

The intended defense-in-depth model has seven layers:

| Layer         | Current mechanism                         | Required framework direction              |
| ------------- | ----------------------------------------- | ----------------------------------------- |
| Identity      | Manual `cc-agent` guide                   | Doctor check and installer checklist      |
| Workspace     | Manual Git Worktree guidance              | Worktree-per-session validation           |
| Filesystem    | `denyRead` / `denyWrite`, target presets  | Real-path and symlink-safe validation      |
| Commands      | String allow / ask / deny rules           | Structured command parser                 |
| Network       | Target-specific asks or declarative deny  | Domain-scoped policy with per-role needs   |
| Secrets       | Denied paths and environment guidance     | Secret path and env exposure diagnostics   |
| Human gates   | Task Card, routing, reviewer checkpoints  | CLI-visible gate verification             |

## Target Comparison

| Concern              | Codex preset                     | OpenCode preset                         | Claude preset                         |
| -------------------- | -------------------------------- | --------------------------------------- | ------------------------------------- |
| Agent contracts      | Embedded in `AGENTS.md`          | Dedicated agent files                   | Embedded roles in `CLAUDE.md`         |
| Command permissions  | Documented rules                 | `opencode.jsonc` permission block       | `.claude/settings.json` allow/deny    |
| Read/write controls  | Contract-only                    | Read/edit sections in config            | Primarily command-level settings      |
| Network controls     | Contract-only                    | `webfetch` / `websearch` ask            | Not represented in preset settings    |
| Role capabilities    | Contract permissions             | Frontmatter plus config                 | Role text plus settings               |
| Session isolation    | New session guidance             | `/new` and worktree guidance            | Context scope and worktree guidance   |
| Runtime enforcement  | Depends on Codex                 | Depends on OpenCode                     | Depends on Claude Code                |

## Findings

### High: Policy drift across target presets

`policy.yml` is richer than the target-specific presets. OpenCode has explicit
filesystem, command, network, task, and skill controls; Claude primarily has
shell allow/deny rules; Codex relies on `AGENTS.md` contracts.

Impact: teams may believe a policy is enforced uniformly when the target tool
cannot represent the same boundary.

Recommendation: treat `policy.yml` as the canonical policy source and maintain a
target compatibility matrix that marks each rule as `enforced`, `documented`,
`manual`, or `unsupported`.

### High: Runtime isolation remains manual

The agent-user isolation guide defines a strong model, but it is not wired into
installation, doctor checks, or scorecards.

Impact: agents may run as the primary developer user with access to SSH keys,
home directories, environment variables, and unrelated repositories.

Recommendation: make identity isolation and worktree isolation explicit doctor
checks. In v0.1.x they should warn; once runtime support exists they should be
enforceable gates.

### Medium: Role permissions can exceed role contracts

Some OpenCode agent frontmatter grants write/edit access to roles whose
contracts are read-only or coordination-only.

Impact: accidental edits become possible from roles intended only to plan,
route, review, or ask clarifying questions.

Recommendation: align frontmatter with least privilege. Read-only roles should
disable write/edit tools. Docs, Tester, and Implementer remain write-capable
because their deliverables require file changes.

### Medium: Command matching is string based

Current allow/deny rules are target-tool string patterns.

Impact: shell operators, aliases, substitutions, redirection, glob expansion,
case differences, and platform-specific parsing can bypass naive matching.

Recommendation: the policy compiler must parse command structure before
evaluating allow/ask/deny rules. Raw string matching can remain only as a target
rendering format.

### Medium: Secret handling lacks diagnostic coverage

The presets deny common secret paths, but there is no automated verification for
project-local secret files, user profile exposure, or inherited environment
variables.

Impact: sensitive values can leak through readable files or command output even
when obvious paths are denied.

Recommendation: add doctor checks for denied secret files, risky env names,
readable home/profile paths from the agent identity, and logs that may capture
command output.

## Framework Improvements

- Define `policy.yml` as the canonical security contract and generate target
  configs from it when the CLI exists.
- Add `docs/target-security-compatibility.md` or an equivalent section in
  `docs/security-model.md` covering Codex, OpenCode, and Claude.
- Extend `codeconductor doctor` to validate least-privilege role capabilities,
  target permission drift, protected branches, secret path denies, network
  posture, and worktree guidance.
- Add a target renderer rule: if a security rule cannot be represented by a
  target, render an explicit warning instead of silently dropping it.
- Keep hard runtime claims out of docs until the policy compiler and runtime
  enforcement exist.

## Acceptance Checklist

- [ ] Every preset has a clear least-privilege capability model.
- [ ] Every policy rule maps to a target rule or an explicit warning.
- [ ] Doctor reports unsafe or unsupported permission expansion.
- [ ] Manual install guides include identity and worktree isolation checks.
- [ ] Security docs distinguish current guarantees from planned runtime
      guarantees.
