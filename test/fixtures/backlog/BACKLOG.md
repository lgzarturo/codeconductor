# BACKLOG

## Global
- Product: CodeConductor
- Strategy: FIFO by priority, then dependency graph
- Policy: no task larger than 1-2 implementation sessions
- Review required: yes
- TDD required: yes

## Items

### BC-001 | Add backlog parser
- Priority: P1
- Status: READY
- Type: feature
- Owner: CodeConductor
- Depends on: none
- Description: Parse BACKLOG.md into typed structure for orchestration.
- Scope: src/core/openspec/
- Out of scope: external issue trackers
- Business value: Enables FIFO delivery from backlog
- Acceptance:
  - [ ] openspec validate accepts well-formed BACKLOG.md
  - [ ] openspec validate rejects malformed entries with recommendations
- Risks: Parser must stay deterministic
- Progress: 0%
- Branch: feature/backlog-parser
- Reviewer: reviewer
- Last update: 2026-07-25

### BC-002 | Add reviewer agent gate
- Priority: P2
- Status: TODO
- Type: feature
- Depends on: BC-001
- Description: Reviewer validates acceptance criteria before DONE.
- Scope: src/core/openspec/
- Out of scope: automated PR creation
- Acceptance:
  - [ ] Reviewer can approve or reject backlog items
  - [ ] Rejected items return to IN_PROGRESS with notes
- Progress: 0%

## Archive

### BC-000 | Initial scaffold
- Priority: P3
- Status: DONE
- Type: tech-debt
- Depends on: none
- Description: Scaffold openspec integration.
- Scope: docs/
- Out of scope: none
- Acceptance:
  - [ ] BACKLOG.md template exists in init
- Progress: 100%
