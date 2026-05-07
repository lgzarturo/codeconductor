# Task Card

```
ID:     booking-20260507-001
Title:  Add paginated user listing endpoint with email filter
Type:   feature
Risk:   medium
Status: ready
```

---

## Context

The operations team needs an admin endpoint to browse and search registered
users. Currently no such endpoint exists — user lookup is done directly via
database queries, which is not sustainable.

The users table already has over 10,000 rows and grows at ~200/day. Any
implementation must use server-side pagination. The frontend admin panel expects
a standard envelope format consistent with other listing endpoints in this API.

**Background**: `UserEntity` already exists with the full data model. The task
is to expose a safe, filtered, paginated read-only view of that data. No changes
to the entity model or auth configuration are in scope.

---

## Scope

### Files to Create

- `src/main/kotlin/com/booking/user/UserController.kt` REST controller for
  `GET /api/v1/users`
- `src/main/kotlin/com/booking/user/dto/UserSummary.kt` Safe DTO — no password
  hash, no internal flags
- `src/main/kotlin/com/booking/user/dto/UserListResponse.kt` Paginated response
  envelope
- `src/test/kotlin/com/booking/user/UserControllerTest.kt` Integration tests for
  the endpoint

### Files to Modify

- `src/main/kotlin/com/booking/user/UserRepository.kt` Add query method for
  case-insensitive email filter with pagination

### Hard Boundaries

- Do NOT modify `UserEntity.kt` — the data model is frozen for this task
- Do NOT touch Spring Security configuration — `/api/**` is already protected
- Do NOT add new dependencies to `build.gradle.kts`
- Do NOT expose `passwordHash`, `active`, or any internal audit fields

---

## Acceptance Criteria

1. `GET /api/v1/users` returns HTTP 200 with a paginated list of users in the
   standard envelope format used by this API.

2. The `email` query parameter filters results using a case-insensitive partial
   match (e.g., `?email=arturo` matches `Arturo@example.com`).

3. When no users match the filter, the response is HTTP 200 with an empty
   `items` array — never HTTP 404.

4. The response includes pagination metadata: `page`, `size`, `total` (total
   matching records), and `totalPages`.

5. Requests without a valid `Authorization: Bearer {token}` header receive HTTP
   401 — enforced by the existing security middleware, not by this code.

---

## Constraints

| Constraint        | Value                                        |
| ----------------- | -------------------------------------------- |
| Max response time | < 200ms for pages up to 50 items             |
| Max page size     | 100 items                                    |
| Default page size | 20 items                                     |
| Default page      | 0 (zero-indexed)                             |
| Exposed fields    | id, email, name, createdAt only              |
| Auth enforcement  | existing Spring Security config (no changes) |

---

## Non-Goals

- Creating or updating users
- Sorting beyond default (createdAt DESC)
- CSV / export functionality
- Filtering by fields other than email

---

## Routing

```text
architect → implementer → tester → reviewer
```

| Step | Agent       | Required                                                |
| ---- | ----------- | ------------------------------------------------------- |
| 1    | architect   | yes — design must be approved before implementation     |
| 2    | implementer | yes                                                     |
| 3    | tester      | embedded in implementer step (unit + integration tests) |
| 4    | reviewer    | yes — verdict required before merge                     |

**Requires review**: yes **Requires tests**: yes — minimum 80% branch coverage
for new code **Can merge without review**: no

---

## References

- Existing paginated endpoint for reference: `BookingController.kt` (GET
  /api/v1/bookings)
- Auth config: `SecurityConfig.kt`
- User model: `UserEntity.kt`
- API conventions: `docs/api-conventions.md`
