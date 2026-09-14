<!-- CODECONDUCTOR:BEGIN managed -->

# CodeConductor — Gemini CLI Preset

This file configures CodeConductor for **Gemini CLI**. It lives at the project
root (`GEMINI.md`) so Gemini CLI's hierarchical context loader picks it up
from the current directory and every ancestor up to the project root.

## Behavioral Discipline

1. **Think Before Coding** — state assumptions; ask if uncertain; present
   alternatives instead of picking silently.
2. **Simplicity First** — minimum code that solves the problem; no
   speculative abstractions.
3. **Surgical Changes** — touch only what the task requires; match existing
   style; remove only what your own change made unused.
4. **Goal-Driven Execution** — turn the task into a verifiable goal with a
   success check; loop until it passes.

## Commands

CodeConductor ships its slash commands as native Gemini CLI TOML commands
under `.gemini/commands/cc/`, invoked as `/cc:<name>` (e.g. `/cc:feature`,
`/cc:review`). Run `/cc:ask "<problem>"` when unsure which one applies — it
recommends exactly one and stops; it does not start the workflow.

Skills live under `.gemini/skills/` (Gemini CLI's native Agent Skills
discovery path, shared with `.agents/skills/` per the Agent Skills open
standard). Read `.gemini/skills/using-cc-skills/SKILL.md` first — it maps
intent to the right slash command.

## What never changes

- Do not invoke the Implementer without an accepted Technical Plan.
- Do not skip the Reviewer step for medium- or high-risk changes.
- Do not store secrets in any file loaded by Gemini CLI.

<!-- CODECONDUCTOR:END managed -->
