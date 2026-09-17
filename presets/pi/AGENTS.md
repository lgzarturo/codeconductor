<!-- CODECONDUCTOR:BEGIN managed -->

# CodeConductor — Pi Preset

This file configures CodeConductor for **Pi** (pi.dev — `earendil-works/pi`,
the coding-agent CLI, not Inflection's Pi). It lives at the project root
(`AGENTS.md`) so Pi's context-file loader picks it up automatically.

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

CodeConductor ships its slash commands as Pi prompt templates under
`.pi/prompts/`, invoked as `/cc-<name>` (e.g. `/cc-feature`, `/cc-review`).
Run `/cc-ask "<problem>"` when unsure which one applies — it recommends
exactly one and stops; it does not start the workflow.

Skills live under `.agents/skills/` (shared with the agy preset — Pi
discovers skills there natively, per its own docs). Read
`.agents/skills/using-cc-skills/SKILL.md` first — it maps intent to the
right slash command.

Pi has no Task tool or subagents: every command runs in your own session.
Where a step says "adopt the `X` role", read the matching file under
`.agents/agents/` (short) or `.agents/prompts/v1.0.0/` (full contract) and
act as that role for the rest of the step.

## What never changes

- Do not invoke the Implementer without an accepted Technical Plan.
- Do not skip the Reviewer step for medium- or high-risk changes.
- Do not store secrets in any file loaded by Pi.

## Receipt integrity

- For any implementation, test, review, handoff, or delivery decision, capture or verify the current RDD receipt with `bun run dev rdd`.
- A receipt is valid only for its exact candidate. If code, tests, contracts, or runner configuration changed, repeat the affected verification.
- TDD and Mutation Testing retain their existing gates; RDD verifies that their observed evidence still belongs to the current candidate.

<!-- CODECONDUCTOR:END managed -->
