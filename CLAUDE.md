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
