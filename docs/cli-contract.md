# CLI Contract

## Purpose

This document defines the planned CodeConductor CLI contract before
implementation. The CLI is not implemented in v0.1.x.

## Commands

### `codeconductor init`

Initialize CodeConductor files in a target project.

Planned behavior:

- Detect project stack when `--stack` is omitted
- Resolve target preset
- Render files
- Show planned changes
- Apply changes only after confirmation

### `codeconductor doctor`

Validate an installed CodeConductor configuration.

Planned behavior:

- Check required files
- Validate managed markers
- Validate policy schema
- Warn about risky target-tool permissions
- Compare target presets against canonical `policy.yml`
- Warn when a role has broader tool permissions than its contract requires
- Warn when low-privilege user or worktree isolation is not detected
- Warn when secret-path denies or network posture are missing
- Report unsupported or conflicting configuration

### `codeconductor update`

Update installed CodeConductor-managed sections and preset files.

Planned behavior:

- Read installed contract version
- Compare with repository version
- Show changes before writing
- Preserve user-owned content outside managed sections

### `codeconductor sync claude`

Generate or update Claude Code-compatible files from CodeConductor contracts.

### `codeconductor sync opencode`

Generate or update OpenCode-compatible files from CodeConductor contracts.

## Exit Codes

| Code | Meaning             |
| ---- | ------------------- |
| 0    | success             |
| 1    | validation error    |
| 2    | unsafe operation    |
| 3    | unsupported project |
| 4    | config conflict     |

## Output Modes

### `human`

Default mode for interactive terminal use. Output should be concise, actionable,
and grouped by status.

### `json`

Machine-readable mode for CI and tooling integrations. JSON output must be
stable across patch releases.

## Contract Rules

- Commands must support `--help`.
- Destructive or state-changing operations must support `--dry-run` where
  practical.
- Unsafe operations must fail with exit code `2`.
- Config conflicts must fail with exit code `4`.
- JSON output must not include ANSI color codes.
