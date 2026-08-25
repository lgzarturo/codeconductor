# Design: Gate pre-commit typecheck y test adaptado a Bun

## Approach

Ship a **stdlib-first installer** as a fenced bash block inside `GATE.md`. Agents run that block from the repo root. It writes `.git/hooks/pre-commit` (via `git rev-parse --git-dir`, worktree-safe) that runs:

1. `bun run typecheck` — fail closed (`exit 1`)
2. `bun run test` — fail closed (`exit 1`)

No Husky, lint-staged, npm packages, or curl-to-pipe installer. If `package.json` already contains `"husky"` or `"lint-staged"`, or if a pre-commit hook already exists, the installer prints a warning and exits 0 without overwriting.

Canonical copy: `presets/claude/gates/pre-commit/GATE.md`. Identical copies live under cursor, opencode, agy, and codex so each runner preset documents the same gate.

## Files Affected

- `presets/*/gates/pre-commit/GATE.md` — installer + agent docs
- `test/gates-pre-commit.test.ts` — extracts the bash fence and exercises install/commit in temp git repos
- `test/gates-pre-commit-presets.test.ts` — every listed preset carries the same fence

## Risks

- Projects without `typecheck` / `test` scripts in `package.json` will fail every commit after install — documented in GATE.md troubleshooting.
- Existing hooks are never overwritten; operators must remove them to adopt this gate.

## Acceptance Criteria

- El hook pre-commit ejecuta typecheck y test antes de permitir el commit
- El gate no añade dependencias externas cuando el proyecto no las tiene
- Un commit con typecheck fallido queda bloqueado por el hook
