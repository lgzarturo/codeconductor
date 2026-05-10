# CLAUDE.md

This repository uses CodeConductor to maintain CodeConductor itself.

## Repository State

CodeConductor is currently documentation-first and preset-based. The CLI and
runtime enforcement are planned but not implemented.

The repository currently ships manual presets, agent contracts, workflow
templates, policy documentation, and installation guides. It does not ship a
runtime sandbox, policy compiler, doctor command, or automated project scanner.

## Canonical Sources

- `README.md`: project overview and current scope
- `ROADMAP.md`: release plan
- `docs/architecture.md`: current and planned architecture
- `docs/security-model.md`: current security model and non-guarantees
- `docs/current-limitations.md`: known limitations
- `policy.yml`: declarative policy model
- `AGENTS.md`: repository agent workflow

## Working Rules

- Keep documentation honest about what exists today and what is planned.
- Do not describe planned CLI or runtime behavior as implemented.
- Keep policy language clear that enforcement depends on the target tool until
  the policy compiler exists.
- Preserve CodeConductor vocabulary: Task Card, Route, Conductor Agent, Routing
  Policy, Agent Contract, Skill, Deliverable, and Scorecard.

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100KB unless explicitly required.
- Suggest running /cost when a session is running long to monitor cache ratio.
- Recommend starting a new session when switching to an unrelated task.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.
- When using tools, be precise and minimal with context.

## Context Budget

- If the task type differs from the previous one, execute "/clear" before
  starting.
- Delegate verbose operations to sub-agents.
