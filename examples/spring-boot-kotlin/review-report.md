# Review Report

**Task Card:** booking-20260507-001 **Agent:** reviewer **Agent Contract:**
v0.1.0 **Date:** 2026-05-07

---

## Summary

Implementation is correct, idiomatic Kotlin/Spring Boot, and covers all
acceptance criteria. Two warnings require attention before merge — one is a
production performance risk that must be addressed with a follow-up migration.

---

## Findings

### CRITICAL

None.

---

### WARNING

**W1 — Missing index on `users.email`**

The email filter uses `LOWER(email) LIKE LOWER('%value%')`. With a leading
wildcard, PostgreSQL cannot use a B-tree index. For the current 10k row count
this executes in ~3ms, but linear scan time grows with table size. At 100k rows
this endpoint will exceed the 200ms SLA defined in the Task Card constraints.

Required action: create a follow-up task for a Flyway migration:

```sql
-- V20260507__add_users_email_trgm_index.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_email_trgm ON users USING GIN (email gin_trgm_ops);
```

This index supports `ILIKE` / `LIKE '%...%'` patterns efficiently. Do not merge
to production without scheduling this migration.

---

**W2 — H2 test mode diverges from PostgreSQL ILIKE behavior**

The integration tests use H2 in PostgreSQL mode. H2's `LIKE` is case-sensitive
by default; the `MODE=PostgreSQL` setting approximates but does not fully
replicate PostgreSQL's `ILIKE`. The case-insensitivity test passes because
Spring Data generates `LOWER(...) LIKE LOWER(...)` — but edge cases around
collation and special characters (e.g., accented letters in emails) may pass
locally and fail in production.

Required action: add Testcontainers PostgreSQL as a `testImplementation`
dependency and migrate `UserControllerTest` to use it. This is a one-time
investment that pays for all future repository tests.

---

### SUGGESTION

**S1 — Add request logging for audit trail**

Admin endpoints that list user data should emit a structured log entry including
the authenticated principal's ID and the filter applied. This is useful for
compliance and anomaly detection.

```kotlin
// In UserController.listUsers, after auth resolution:
log.info("User list requested by={} filter.email={} page={} size={}",
    SecurityContextHolder.getContext().authentication.name,
    email.ifEmpty { "*" }, page, clampedSize)
```

Not blocking — but recommend adding before the endpoint goes to production.

---

**S2 — Validate `page` parameter defensively**

The controller uses `page.coerceAtLeast(0)` which silently corrects negative
values. Consider returning HTTP 400 for `page < 0` or `size < 1` to give API
consumers early feedback rather than silently normalizing bad input. Consistent
with how other APIs in this codebase handle invalid pagination params (verify
against `BookingController`).

Not blocking for this task.

---

## Checklist

| Item                                                                      | Status                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| All acceptance criteria met                                               | ✓                                                 |
| Minimal diff — no scope creep                                             | ✓                                                 |
| Sensitive fields excluded from response                                   | ✓                                                 |
| Tests present and all passing (6/6)                                       | ✓                                                 |
| No regressions in full test suite (147 tests)                             | ✓                                                 |
| Page size clamped to max 100                                              | ✓                                                 |
| Empty result returns 200 not 404                                          | ✓                                                 |
| Hard boundaries respected (no entity changes, no security config changes) | ✓                                                 |
| Project naming and package conventions followed                           | ✓                                                 |
| No new external dependencies added                                        | ✓                                                 |
| API contract matches Technical Plan                                       | ✓                                                 |
| Documentation updated                                                     | — (internal admin endpoint, no public API change) |

---

## Verdict

**PASS with warnings** — implementation is correct and safe to merge after
resolving W1. W2 is strongly recommended before load testing.

---

## Next Step

**implementer**: create migration `V20260507__add_users_email_trgm_index.sql` in
`src/main/resources/db/migration/` and open as a follow-up task before this
endpoint is enabled in production. Reference W1 in the task description.
