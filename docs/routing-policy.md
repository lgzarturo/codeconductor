# Routing Policy

**Version:** v0.1.0

---

## Purpose

The Routing Policy determines which Conductor Agent executes a given task, based
on two inputs: task type and risk classification.

Routing is not optional. Every task that enters the system must be classified
and routed before any agent touches a file. Skipping the routing step is a
workflow defect, not an optimization.

The policy is explicit and auditable. There are no implicit routing decisions.
If a task type and risk level do not appear in this table, escalate to
`orchestrator`.

---

## Risk Classification

Risk is assessed at Task Card creation time, before routing.

| Signal                                    | Risk Level |
| ----------------------------------------- | ---------- |
| New behavior, no existing tests           | medium     |
| Changes to public API or contracts        | high       |
| Database migration                        | high       |
| Security, auth, or payment paths          | high       |
| Internal refactor with full test coverage | low        |
| Documentation only                        | low        |
| Bug fix in isolated component             | low–medium |
| New feature (no existing path)            | high       |

When multiple signals apply, take the highest risk level. Do not average.

---

## Routing Table

| Task Type            | Risk        | Agent Sequence                                      |
| -------------------- | ----------- | --------------------------------------------------- |
| New feature design   | any         | `architect` → `implementer`                         |
| Bug fix              | low         | `implementer`                                       |
| Bug fix              | medium–high | `task-coach` → `implementer` → `tester`             |
| Refactor             | low         | `implementer`                                       |
| Refactor             | medium–high | `architect` → `implementer` → `reviewer`            |
| API change           | any         | `architect` → `implementer` → `reviewer`            |
| Database migration   | any         | `architect` → `implementer` → `tester` → `reviewer` |
| Test coverage        | any         | `tester`                                            |
| Documentation update | any         | `docs`                                              |
| Codebase exploration | any         | `repo-explorer`                                     |
| Code review          | any         | `reviewer`                                          |

Each arrow (`→`) represents a handoff. The next agent does not start until the
previous agent produces an accepted Deliverable.

---

## Escalation

When the routing decision is uncertain — task type is ambiguous, risk cannot be
classified from the available context, or the request spans multiple task types
— escalate to `orchestrator`.

The `orchestrator` receives the raw request, asks `task-coach` to produce a
valid Task Card, and then routes from that Task Card.

No agent may self-escalate to a higher-privilege operation. Escalation flows up
only.

---

## High-Risk Path Patterns

The following path patterns trigger automatic `high` risk classification,
regardless of the task type declared in the Task Card:

```text
security/**
auth/**
payment/**
db/migration/**
migrations/**
# Python / Django additions
apps/*/migrations/**     # Django schema migrations — always high
config/settings*.py      # Application configuration
apps/users/**            # User model and authentication
```

If a task touches any file matching these patterns, it cannot be classified
below `high` risk.

---

## Public Contract Paths

Changes to files matching these patterns require `reviewer` in the agent
sequence, regardless of risk level:

```text
api/**
openapi.yaml
openapi.yml
**/openapi.json
**/swagger.yaml
**/swagger.yml
apps/*/serializers.py      # DRF serializers — public API shape
```

A bug fix classified as `low` that modifies `api/v1/users.yaml` still routes
through `reviewer`.

---

## Rules

**No agent bypasses routing.** An agent that receives a request without a
classified Task Card must refuse to proceed and return the request to
`task-coach` or `orchestrator`.

**Skipping is a defect.** If `implementer` starts writing code without a routing
decision, the workflow is broken. The scorecard for that Deliverable will
reflect the violation.

**Risk does not downgrade mid-task.** If risk is classified as `high` at Task
Card creation, it remains `high` for the duration of that task. An agent may
escalate risk if it discovers new information; it may not downgrade.

**Human review at high risk.** Any task classified as `high` risk requires a
human approval gate before the Deliverable is considered done. The Scorecard
must record the reviewer's name.

---

## Version History

| Version | Date       | Change                                                                                        |
| ------- | ---------- | --------------------------------------------------------------------------------------------- |
| v0.1.0  | 2026-05-07 | Initial routing policy with OpenCode, Claude, Spring Boot/Kotlin, and Python/Django guidance. |
