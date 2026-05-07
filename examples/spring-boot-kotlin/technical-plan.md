# Technical Plan

**Task Card:** booking-20260507-001 **Agent:** architect **Agent Contract:**
v0.1.0 **Date:** 2026-05-07 **Status:** approved

---

## Approach

Standard Spring MVC layered slice: Controller → Service (optional thin layer) →
Repository. Because this is a read-only projection with no business logic, a
dedicated Service class is not warranted — the controller delegates directly to
the repository and maps to DTOs inline. This keeps the diff minimal and
consistent with simpler read endpoints already in the codebase.

For the email filter, `Spring Data JPA` with a derived query using
`LOWER(email) LIKE LOWER(:pattern)` is sufficient and avoids pulling in Spring
Data Specifications for a single filter case. The query is explicit and testable
without mocking.

Pagination uses Spring Data's `Pageable` / `Page<T>` — already a project
convention (confirmed in `BookingController.kt`). The response envelope mirrors
`BookingListResponse` for consistency.

No new dependencies are needed.

---

## Files

### Create

- `src/main/kotlin/com/booking/user/UserController.kt` REST controller. Receives
  `email` (nullable String), `page` (Int, default 0), `size` (Int, default 20,
  clamped to max 100). Delegates to
  `UserRepository.findByEmailContainingIgnoreCase`. Maps `Page<UserEntity>` to
  `UserListResponse`.

- `src/main/kotlin/com/booking/user/dto/UserSummary.kt` Projection DTO. Fields:
  `id` (UUID), `email` (String), `name` (String), `createdAt` (Instant).
  Explicitly excludes `passwordHash`, `active`, and any other sensitive columns.

- `src/main/kotlin/com/booking/user/dto/UserListResponse.kt` Pagination
  envelope. Fields: `items` (List<UserSummary>), `pagination` (PaginationMeta).
  Nested `PaginationMeta`: `page`, `size`, `total`, `totalPages`.

- `src/test/kotlin/com/booking/user/UserControllerTest.kt` Integration test
  using `@SpringBootTest` + `MockMvc` (or Testcontainers if available in the
  project). Tests: 200 with results, 200 with empty results, filter works
  case-insensitively, unauthenticated request returns 401, page size clamped
  to 100.

### Modify

- `src/main/kotlin/com/booking/user/UserRepository.kt` Add one method:

  ```kotlin
  fun findByEmailContainingIgnoreCase(email: String, pageable: Pageable): Page<UserEntity>
  ```

  Spring Data derives the SQL automatically:
  `WHERE LOWER(email) LIKE LOWER(CONCAT('%', :email, '%'))`. For the "no filter"
  case (null email), the controller passes an empty string, which matches all
  rows — simple and avoids two code paths.

---

## API Contract

```text
GET /api/v1/users
Authorization: Bearer {token}

Query parameters:
  email   String   optional   case-insensitive partial match on email field
  page    Int      optional   zero-indexed page number, default 0
  size    Int      optional   page size, default 20, max 100

Response 200 OK:
{
  "items": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "email": "arturo@example.com",
      "name": "Arturo Lopez",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 0,
    "size": 20,
    "total": 143,
    "totalPages": 8
  }
}

Response 401 Unauthorized:
  (handled by Spring Security — no body contract defined by this endpoint)
```

---

## Data Layer

Spring Data JPA derived query in `UserRepository`:

```kotlin
interface UserRepository : JpaRepository<UserEntity, UUID> {

    fun findByEmailContainingIgnoreCase(
        email: String,
        pageable: Pageable
    ): Page<UserEntity>
}
```

The generated JPQL is:

```sql
SELECT u FROM UserEntity u
WHERE LOWER(u.email) LIKE LOWER(CONCAT('%', :email, '%'))
```

PostgreSQL translates this to `ILIKE` semantics. For production correctness, a
`pg_trgm` index on `users.email` would make this O(log n) instead of O(n). That
index is out of scope for this task — see Risks.

**Mapping** (in controller, no separate service):

```kotlin
fun UserEntity.toSummary() = UserSummary(
    id = id,
    email = email,
    name = name,
    createdAt = createdAt
)
```

Extension function keeps the DTO mapping co-located with the controller and
avoids adding a mapper class for a single use case.

---

## Risks

1. **N+1 on eager associations** — If `UserEntity` has `@OneToMany` or
   `@ManyToMany` relationships fetched eagerly, the page query will trigger
   additional queries per row. Mitigation: use a `@Query` with a DTO projection
   (`SELECT NEW com.booking.user.dto.UserSummary(...)`) if N+1 is detected
   during testing. The derived query approach is preferred first; switch only if
   needed.

2. **Email search performance without index** — `LIKE '%value%'` with leading
   wildcard cannot use a B-tree index. For 10k rows this is acceptable (< 5ms).
   For 100k+ rows, recommend a follow-up task to add a GIN index via `pg_trgm`.
   Create migration in a separate task — not this one.

3. **Page size enforcement** — If `size=500` is passed, the database query will
   fetch 500 rows. The controller MUST clamp `size` to 100 before constructing
   the `PageRequest`. Spring Data does not clamp automatically.

4. **Auth middleware coverage** — `/api/v1/users` must fall under the existing
   `antMatcher("/api/**")` rule in `SecurityConfig`. Verify this is the case
   before integration testing; do not add a new security rule.

---

## Open Questions

- **Spring Security matcher pattern**: assumed `/api/**` covers `/api/v1/users`.
  Implementer must verify — if the matcher is more specific, open a separate
  task to update security config rather than expanding scope here.

- **Testcontainers availability**: if `testcontainers-postgresql` is already in
  `build.gradle.kts`, use it for integration tests (preferred — tests the real
  ILIKE behavior). If not available, use H2 with `MODE=PostgreSQL`. Do NOT add
  Testcontainers as a new dependency for this task.

- **Timezone handling for `createdAt`**: serialize as UTC ISO-8601 string.
  Verify `spring.jackson.time-zone=UTC` is set in `application.properties`; if
  not, add it (this is a config fix, not a scope change).
