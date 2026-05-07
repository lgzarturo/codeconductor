# Implementation Summary

**Task Card:** booking-20260507-001 **Agent:** implementer **Agent Contract:**
v0.1.0 **Date:** 2026-05-07

---

## Changes

### Created

**`src/main/kotlin/com/booking/user/dto/UserSummary.kt`**

```kotlin
package com.booking.user.dto

import java.time.Instant
import java.util.UUID

data class UserSummary(
    val id: UUID,
    val email: String,
    val name: String,
    val createdAt: Instant,
)
```

**`src/main/kotlin/com/booking/user/dto/UserListResponse.kt`**

```kotlin
package com.booking.user.dto

data class UserListResponse(
    val items: List<UserSummary>,
    val pagination: PaginationMeta,
)

data class PaginationMeta(
    val page: Int,
    val size: Int,
    val total: Long,
    val totalPages: Int,
)
```

**`src/main/kotlin/com/booking/user/UserController.kt`**

```kotlin
package com.booking.user

import com.booking.user.dto.PaginationMeta
import com.booking.user.dto.UserListResponse
import com.booking.user.dto.UserSummary
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

@RestController
@RequestMapping("/api/v1/users")
class UserController(
    private val userRepository: UserRepository,
) {

    @GetMapping
    fun listUsers(
        @RequestParam(required = false, defaultValue = "") email: String,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "20") size: Int,
    ): ResponseEntity<UserListResponse> {
        val clampedSize = size.coerceIn(1, 100)
        val pageable = PageRequest.of(
            page.coerceAtLeast(0),
            clampedSize,
            Sort.by(Sort.Direction.DESC, "createdAt"),
        )

        val result = userRepository.findByEmailContainingIgnoreCase(email, pageable)

        val response = UserListResponse(
            items = result.content.map { it.toSummary() },
            pagination = PaginationMeta(
                page = result.number,
                size = result.size,
                total = result.totalElements,
                totalPages = result.totalPages,
            ),
        )

        return ResponseEntity.ok(response)
    }

    private fun UserEntity.toSummary() = UserSummary(
        id = id,
        email = email,
        name = name,
        createdAt = createdAt,
    )
}
```

**`src/test/kotlin/com/booking/user/UserControllerTest.kt`**

```kotlin
package com.booking.user

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.Instant
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var userRepository: UserRepository

    @BeforeEach
    fun setUp() {
        userRepository.deleteAll()
        userRepository.saveAll(
            listOf(
                buildUser(email = "arturo@example.com", name = "Arturo Lopez"),
                buildUser(email = "beatriz@example.com", name = "Beatriz Gomez"),
                buildUser(email = "carlos@booking.io", name = "Carlos Diaz"),
            ),
        )
    }

    @Test
    fun `GET users returns 200 with paginated list`() {
        mockMvc.get("/api/v1/users") {
            with(jwt())
            accept(MediaType.APPLICATION_JSON)
        }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(3) }
            jsonPath("$.pagination.total") { value(3) }
            jsonPath("$.pagination.page") { value(0) }
            jsonPath("$.pagination.size") { value(20) }
            jsonPath("$.pagination.totalPages") { value(1) }
        }
    }

    @Test
    fun `GET users filters by email case-insensitively`() {
        mockMvc.get("/api/v1/users?email=ARTURO") {
            with(jwt())
        }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(1) }
            jsonPath("$.items[0].email") { value("arturo@example.com") }
        }
    }

    @Test
    fun `GET users returns 200 with empty items when no match`() {
        mockMvc.get("/api/v1/users?email=nobody") {
            with(jwt())
        }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(0) }
            jsonPath("$.pagination.total") { value(0) }
        }
    }

    @Test
    fun `GET users returns 401 without authentication`() {
        mockMvc.get("/api/v1/users").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `GET users clamps page size to 100`() {
        mockMvc.get("/api/v1/users?size=500") {
            with(jwt())
        }.andExpect {
            status { isOk() }
            jsonPath("$.pagination.size") { value(100) }
        }
    }

    @Test
    fun `GET users does not expose sensitive fields`() {
        mockMvc.get("/api/v1/users") {
            with(jwt())
        }.andExpect {
            status { isOk() }
            jsonPath("$.items[0].passwordHash") { doesNotExist() }
            jsonPath("$.items[0].active") { doesNotExist() }
        }
    }

    private fun buildUser(email: String, name: String) = UserEntity(
        id = UUID.randomUUID(),
        email = email,
        name = name,
        passwordHash = "irrelevant-hash",
        createdAt = Instant.now(),
        active = true,
    )
}
```

---

### Modified

**`src/main/kotlin/com/booking/user/UserRepository.kt`**

```diff
  package com.booking.user

  import org.springframework.data.domain.Page
  import org.springframework.data.domain.Pageable
  import org.springframework.data.jpa.repository.JpaRepository
+ import org.springframework.stereotype.Repository
  import java.util.UUID

+ @Repository
  interface UserRepository : JpaRepository<UserEntity, UUID> {
+
+     fun findByEmailContainingIgnoreCase(
+         email: String,
+         pageable: Pageable,
+     ): Page<UserEntity>
  }
```

The `@Repository` annotation was already absent and is optional for Spring Data
interfaces — added for IDE navigation clarity only, not functional.

---

## Tests Run

```bash
./gradlew test --tests "com.booking.user.UserControllerTest"
```

```text
UserControllerTest > GET users returns 200 with paginated list PASSED
UserControllerTest > GET users filters by email case-insensitively PASSED
UserControllerTest > GET users returns 200 with empty items when no match PASSED
UserControllerTest > GET users returns 401 without authentication PASSED
UserControllerTest > GET users clamps page size to 100 PASSED
UserControllerTest > GET users does not expose sensitive fields PASSED

6 tests completed, 0 failed
```

Full test suite: `./gradlew test` → 147 tests completed, 0 failed (no
regressions in existing test suite).

---

## Verification

Manual smoke test against the local dev server (`./gradlew bootRun`):

```bash
# Obtain token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@booking.io","password":"dev-password"}' \
  | jq -r '.token')

# List users — default pagination
curl -s http://localhost:8080/api/v1/users \
  -H "Authorization: Bearer $TOKEN" | jq .

# Filter by email
curl -s "http://localhost:8080/api/v1/users?email=arturo&page=0&size=10" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Confirm 401 without token
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/users
# → 401
```

---

## Deviations from Technical Plan

None. Implementation follows the Technical Plan exactly:

- Derived query used (no `@Query` needed — no N+1 detected in test data, entity
  has no eager associations)
- Page size clamped with `coerceIn(1, 100)` as specified
- Extension function `UserEntity.toSummary()` co-located in the controller
- H2 in PostgreSQL mode used for integration tests (Testcontainers not present
  in project dependencies)
