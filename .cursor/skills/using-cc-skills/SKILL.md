---
name: using-cc-skills
description:
  Maps incoming work to the CodeConductor slash command and workflow skill.
  Use when starting a session or deciding which /cc-* command applies.
---

# Using CodeConductor skills

## Overview

Pick one slash command. Follow its skill. Invoke CLI for gates. Do not invent
a parallel process.

## When to Use

- Start of a session, ambiguous request, or "which /cc should I run?"

## Process

| Intent | Command | Skill |
| --- | --- | --- |
| New backlog item | `/cc-backlog` | `backlog` |
| Deliver a BC-xxx item | `/cc-openspec` | `openspec` |
| New feature | `/cc-feature` | `openspec` + `testing-tdd` |
| Bug fix | `/cc-fix` | `testing-tdd` |
| Review a diff | `/cc-review` | `evaluation` |
| TDD cycle only | `/cc-tdd-cycle` | `testing-tdd` |
| Scorecard / suites | `/cc-scorecard` | `evaluation` |

Then run the matching CLI (`openspec validate`, `scorecard create --from-diff`,
`hook pre-tool`, `scorecard suite-run`).

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| I'll skip the slash and just code | Skipping the workflow is a defect. |

## Red Flags

- Two slash commands in parallel that mutate the same files
- Implementing before `openspec analyze` when a change folder is active

## Verification

- [ ] One command selected and shown to the user
- [ ] Matching skill loaded before edits
