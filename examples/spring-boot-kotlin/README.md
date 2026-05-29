# Spring Boot Kotlin — End-to-End Example

This example walks through a complete CodeConductor workflow for adding a
paginated user listing endpoint to a real Spring Boot 3.x / Kotlin project.

---

## Project Context

**Project**: `booking-engine` A production REST API for hotel reservations.
Stack: Spring Boot 3.2, Kotlin 1.9, JPA + Hibernate, PostgreSQL 15, Spring
Security (JWT), Gradle.

The project already has:

- `UserEntity` with id, email, name, passwordHash, createdAt, active fields
- JWT authentication middleware applied to all `/api/**` routes
- Standard `Page<T>` pagination convention across other endpoints

---

## The Task

Add an admin endpoint to list users with optional email filter and pagination.

```text
GET /api/v1/users?email=&page=&size=
Authorization: Bearer {token}
```

This endpoint does not exist. There are currently over 10,000 users in
production and the number grows daily, so pagination is non-negotiable.

---

## What This Example Demonstrates

This example shows the complete CodeConductor flow for a medium-risk feature:

```text
Task Card
  └─► architect agent     → Technical Plan
        └─► implementer agent  → Implementation Summary
              └─► tester agent       → (tests embedded in implementation)
                    └─► reviewer agent     → Review Report
```

Each artifact is produced by a specific **Conductor Agent** following its
**Agent Contract** (versioned instructions). The Task Card is the single source
of truth that all agents read — none of them are given ad-hoc instructions.

Key concepts illustrated:

- **Task Card**: structured request with scope, criteria, and constraints
- **Route**: architect → implementer → tester → reviewer (defined in the card)
- **Technical Plan**: architect's output before any code is written
- **Implementation Summary**: implementer's output with real code and diffs
- **Review Report**: reviewer's structured findings with a clear verdict
- **Deliverable**: the final merged code — not included here, lives in the repo
- **Scorecard**: evaluation of agent quality (not in scope for this example)

---

## Files in This Example

| File                        | Produced by         | Represents                                        |
| --------------------------- | ------------------- | ------------------------------------------------- |
| `task-card.md`              | Human (team lead)   | The structured request — input to the entire flow |
| `technical-plan.md`         | `architect` agent   | Design decisions before implementation            |
| `implementation-summary.md` | `implementer` agent | Code written, tests run, deviations noted         |
| `review-report.md`          | `reviewer` agent    | Findings, checklist, verdict                      |

`README.md` (this file) is documentation, not a CodeConductor artifact.

---

## How to Use This as a Template

1. Copy `task-card.md` to your project's `.conductor/tasks/` directory.
2. Replace every field with your own feature's details.
3. Run the route defined in the Task Card through your CodeConductor setup:

   ```bash
   npx cc-codeconductor run task-card.md
   ```

4. Each agent reads the card and its own Agent Contract, then produces its
   artifact in `.conductor/artifacts/`.
5. Use `technical-plan.md`, `implementation-summary.md`, and `review-report.md`
   as reference for what each agent's output should look like.

**This is not a tutorial on Spring Boot.** The Kotlin code shown in the
implementation summary is correct and production-ready, but the point is the
_workflow_, not the framework. The same flow applies to any stack.

---

## Key Principle

> Stop prompting. Start orchestrating.

The team lead writes one Task Card. The agents follow their contracts. No one
gives ad-hoc instructions mid-flow. The Review Report contains the only feedback
that matters: a verdict and a specific next step.
