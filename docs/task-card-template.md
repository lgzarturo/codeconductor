# Task Card Template

## What Is a Task Card

A Task Card is the structured input contract that every Conductor Agent requires
before starting work.

It is not a GitHub issue. It is not a chat message. It is not a vague request
that the agent is expected to clarify on its own.

A Task Card defines:

- what must be done (acceptance criteria)
- what must not be touched (boundaries)
- why it matters (context)
- what the risk level is (drives routing)
- which constraints are non-negotiable

Without a valid Task Card, no agent starts. This is not a convention — it is a
routing precondition enforced by the `orchestrator`.

---

## Why Not Use GitHub Issues Directly

GitHub issues are written for humans: they are conversational, often vague, and
optimized for discussion. They are a good source of information for creating a
Task Card. They are not a replacement.

Issues lack:

- explicit file boundaries (scope)
- risk classification (routing depends on this)
- measurable acceptance criteria (agents cannot self-verify against "looks
  good")
- hard constraints (backward compatibility, performance budgets)

When an agent receives an issue link instead of a Task Card, `task-coach` must
be invoked to produce the card before routing proceeds. The issue is input; the
Task Card is the contract.

---

## Template

```markdown
## Task Card

**ID:** [project-YYYYMMDD-NNN] **Title:** [one line, verb + object] **Type:**
feature | fix | refactor | review | docs | test **Risk:** low | medium | high
**Status:** draft | ready | in-progress | review | done

**Scope:**

- Files: [explicit list of files or modules expected to change]
- Boundaries: [what must NOT change]

### Context

[Current behavior and why it is a problem or opportunity. One paragraph max.]

### Acceptance Criteria

- [ ] [measurable, verifiable condition]
- [ ] [measurable, verifiable condition]
- [ ] [tests pass / no regressions]

### Constraints

- [API backward compatibility required / not required]
- [Performance budget]
- [Dependency restrictions]
- [Any other hard constraint]

### Routing

**Agent:** [agent name] **Requires human review:** yes | no **Requires tests:**
yes | no **Context scope:** isolated | continuation | full

### Notes

[Optional: ADR references, related task cards, known risks]
```

---

## Field Reference

**ID** — Unique identifier. Format: `project-YYYYMMDD-NNN`. Example:
`payments-20240315-001`. Enables cross-references between Task Cards and
Scorecards.

**Title** — One line. Verb + object. Not a question. Not a noun phrase. Good:
`Add pagination to the user list endpoint`. Bad: `User list pagination`.

**Type** — Determines which routing rules apply. Use the smallest type that
accurately describes the work. A bug fix that requires a new test is still
`fix`, not `feature`.

**Risk** — Drives agent sequence. Classify before routing. See
`routing-policy.md` for signal table.

**Status** — Tracks lifecycle. `draft` means it is not yet ready for routing.
Only `ready` cards are accepted by `orchestrator`.

**Scope / Files** — Explicit list. Not "the auth module" — list the actual files
or packages. If you cannot list them, `repo-explorer` runs first.

**Scope / Boundaries** — What the agent must not modify. Non-negotiable.

**Context** — One paragraph. Current state, why it is a problem or opportunity.
No implementation detail here — that belongs to the agent.

**Acceptance Criteria** — Measurable and verifiable. Each item must be
independently checkable. Avoid "looks good" or "works correctly" — those are not
criteria, they are hopes.

**Constraints** — Hard limits. If an API must remain backward compatible, state
it here. If a response must stay under 200ms, state it here. Agents do not infer
constraints.

**Routing / Agent** — The first agent in the sequence. Derived from the Routing
Table in `routing-policy.md`.

**Routing / Requires human review** — `yes` for any `high` risk task. `no` is
only valid for `low` risk.

**Routing / Requires tests** — `yes` unless the task type is `docs` or `review`.
When in doubt, `yes`.

**Routing / Context scope** — Determines how much context the agent should
retain: `isolated` (task-only, minimal prior context), `continuation` (relevant
prior context), or `full` (all session context). Defaults to `isolated` for most
tasks.

---

## Example: Low-Risk Feature

```markdown
## Task Card

**ID:** payments-20240315-001 **Title:** Add currency field to payment summary
response **Type:** feature **Risk:** low **Status:** ready

**Scope:**

- Files: src/payments/dto/PaymentSummaryResponse.kt,
  src/payments/mapper/PaymentMapper.kt, src/payments/PaymentServiceTest.kt
- Boundaries: Do not modify PaymentEntity, database schema, or existing response
  fields

### Context

The payment summary endpoint returns amount but not currency. Clients are
hardcoding USD. Three support tickets in Q1 related to currency display errors
in multi-currency accounts.

### Acceptance Criteria

- [ ] PaymentSummaryResponse includes a non-null `currency` field (ISO 4217)
- [ ] PaymentMapper maps currency from PaymentEntity.currency
- [ ] Existing serialization tests pass without modification
- [ ] New unit test verifies currency is mapped correctly for EUR and BRL

### Constraints

- Response schema must remain backward compatible (currency is additive)
- No new dependencies
- No database migration required

### Routing

**Agent:** implementer **Requires human review:** no **Requires tests:** yes
**Context scope:** isolated

### Notes

Related to PaymentEntity.currency added in payments-20240210-003.
```

---

## Example: High-Risk Database Migration

```markdown
## Task Card

**ID:** payments-20240401-007 **Title:** Migrate payment_method from VARCHAR to
ENUM in payments table **Type:** refactor **Risk:** high **Status:** ready

**Scope:**

- Files: db/migration/V12\_\_payment_method_to_enum.sql,
  src/payments/domain/PaymentMethod.kt,
  src/payments/repository/PaymentRepository.kt,
  src/payments/PaymentRepositoryIntegrationTest.kt
- Boundaries: Do not modify PaymentSummaryResponse, PaymentEntity fields other
  than payment_method, or any endpoint response schema

### Context

payment_method is stored as a free-text VARCHAR. Invalid values exist in
production (e.g., "credit", "creditcard", "CREDIT_CARD"). Validation is
inconsistent across services. The domain enum PaymentMethod.kt already defines
valid values but is not enforced at the database level.

### Acceptance Criteria

- [ ] Migration adds ENUM constraint to payments.payment_method column
- [ ] Migration script handles existing invalid values with explicit fallback
      strategy (document the strategy in the migration file)
- [ ] PaymentRepository reads and writes PaymentMethod enum correctly
- [ ] Integration tests cover INSERT and SELECT with all enum values
- [ ] Rollback script is included alongside migration

### Constraints

- Migration must be reversible (V12\_\_rollback.sql required)
- Zero production downtime: migration must support the existing application
  version reading from the column during the migration window
- No change to the REST API response shape

### Routing

**Agent:** architect → implementer → tester → reviewer **Requires human
review:** yes **Requires tests:** yes **Context scope:** full

### Notes

Coordinate with DBA before applying in production. Migration window: off-peak
only. See ADR-008 for enum strategy decision.
```

---

## Rule

A Task Card in `draft` status is not ready for routing. No agent accepts a
`draft` card.

A Task Card is considered valid when:

1. All required fields are filled
2. Acceptance criteria are measurable
3. Scope boundaries are explicit
4. Risk is classified
5. Status is `ready`

If any of these conditions is not met, `task-coach` must refine the card before
routing proceeds.
