---
id: testing-tdd
version: 1.0.0
name: Test-Driven Development
description:
  Provides expert knowledge for applying the Red-Green-Refactor cycle, designing
  tests at the right pyramid layer, and implementing TDD across Spring Boot +
  Kotlin, Python (pytest), and Next.js / Astro (Vitest + Playwright) stacks.

compatibility:
  tools: [claude, codex, opencode]
  stacks:
    languages: [kotlin, java, python, typescript]
    frameworks: [spring-boot, junit5, mockk, pytest, vitest, react-testing-library, playwright]
    databases: [postgresql, sqlite, h2]

risk:
  level: low
  can_execute_shell: false
  can_modify_files: true
  requires_network: false

inputs:
  - source_files
  - test_files
  - acceptance criteria or task description

outputs:
  - failing test (Red phase)
  - minimal implementation (Green phase)
  - refactored code with passing tests (Refactor phase)
  - test data factories
  - integration and E2E test scaffolding

quality:
  reviewed_by: codeconductor-core
  version: 0.1.0
---

# Test-Driven Development

## The Red-Green-Refactor Cycle

```text
  ┌─────────────────────────────────────────────┐
  │                                             │
  │   RED → write a failing test                │
  │    ↓                                        │
  │   GREEN → write the minimum code to pass    │
  │    ↓                                        │
  │   REFACTOR → clean up without breaking      │
  │    ↓                                        │
  │   repeat ───────────────────────────────────┘
```

**Red**: Write a test that describes one behavior you want. Run it. It must
fail — if it passes without implementation, the test is not testing anything.

**Green**: Write the simplest code that makes the test pass. Do not optimize.
Do not add features. Just pass the test.

**Refactor**: Clean up duplication, naming, and structure. Run the tests after
every change. If any test breaks, the refactor changed behavior — that is a bug.

The cycle is short. Each iteration should take minutes, not hours. If a cycle
takes longer than 30 minutes, the behavior being tested is too large — split it.

## When to Apply TDD

**Apply TDD for:**

- New business logic with clear rules (validation, calculations, state machines)
- Bug fixes — write a regression test that reproduces the bug first
- Public service layer methods
- API endpoints with defined acceptance criteria

**Do not apply TDD for:**

- Exploratory code where the design is not yet known — spike first, then write
  tests for the final design
- Trivial scaffolding (data class constructors, getters)
- Database migrations — test the resulting schema state, not the migration steps
- Third-party SDK wrappers where behavior is owned by the library

## Test Pyramid

```text
       /\
      /  \
     / E2E\       10% — full browser/API flows, happy path + critical errors
    /------\
   /  Integ \     20% — components with real dependencies (DB, HTTP clients)
  /----------\
 /    Unit    \   70% — isolated logic, mocked dependencies, sub-millisecond
/______________\
```

Unit tests are the TDD workhorse. Write them first. Integration tests verify
that components connect correctly. E2E tests verify that the system works for
the user — keep them minimal and focused on the critical paths.

## TDD Rules

**One failing test at a time.** Write one test, make it pass, then write the
next. Do not write multiple failing tests before implementing.

**The test must fail for the right reason.** A `NullPointerException` on setup
is not a meaningful failure — that is a broken test. The failure must be the
assertion, not an error in the test itself.

**Minimum implementation.** In the Green phase, return a hardcoded value if
that makes the test pass. The next test will force you to generalize.

**Refactor only on green.** Never refactor when tests are failing. You lose the
safety net that tells you whether the refactor changed behavior.

**Tests are not optional after the fact.** Writing tests after implementation
is not TDD. It is documentation. It catches far fewer design problems.

---

## Spring Boot + Kotlin

### Naming Convention

```kotlin
@Test
fun `should [expected behavior] when [condition]`()
```

```kotlin
@Test
fun `should return user when found by id`() { ... }

@Test
fun `should throw NotFoundException when user does not exist`() { ... }

@Test
fun `should not create user when email already exists`() { ... }
```

### TDD Cycle — Unit Test Example

**Requirement**: `UserService.create()` should reject duplicate emails.

**Red** — write the failing test first:

```kotlin
@ExtendWith(MockKExtension::class)
class UserServiceTest {

    @MockK
    private lateinit var userRepository: UserRepository

    private lateinit var userService: UserService

    @BeforeEach
    fun setUp() {
        userService = UserService(userRepository)
    }

    @Test
    fun `should throw ConflictException when email already exists`() {
        // Arrange
        val email = "existing@example.com"
        every { userRepository.existsByEmail(email) } returns true

        // Act & Assert
        assertThrows<ConflictException> {
            userService.create(email = email, name = "Test")
        }
        verify(exactly = 0) { userRepository.save(any()) }
    }
}
```

Run → fails (method does not exist yet).

**Green** — minimum implementation:

```kotlin
class UserService(private val userRepository: UserRepository) {

    fun create(email: String, name: String): User {
        if (userRepository.existsByEmail(email)) {
            throw ConflictException("Email $email is already registered")
        }
        return userRepository.save(User(email = email, name = name))
    }
}
```

Run → passes.

**Refactor** — extract the check into a private guard, add KDoc only if the
domain rule is non-obvious. Run tests → still green.

**Next test** — happy path:

```kotlin
@Test
fun `should create and return user when email is unique`() {
    val email = "new@example.com"
    val saved = User(id = UUID.randomUUID(), email = email, name = "New User")

    every { userRepository.existsByEmail(email) } returns false
    every { userRepository.save(any()) } returns saved

    val result = userService.create(email = email, name = "New User")

    assertThat(result.email).isEqualTo(email)
    verify(exactly = 1) { userRepository.save(any()) }
}
```

### TDD Cycle — Integration Test Example

**Requirement**: `GET /api/users/{id}` returns 404 when the user does not exist.

**Red**:

```kotlin
@SpringBootTest
@AutoConfigureMockMvc
class UserControllerTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Test
    fun `should return 404 when user does not exist`() {
        mockMvc.perform(get("/api/users/${UUID.randomUUID()}"))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.code").value("NOT_FOUND"))
    }
}
```

Run → fails (endpoint may not exist yet, or returns wrong status).

**Green** — add/fix the endpoint and error handler. Run → passes.

**Refactor** — extract error response builder if duplicated across handlers.

### MockK Quick Reference

```kotlin
// Stub return value
every { repo.findById(id) } returns Optional.of(user)

// Stub exception
every { repo.save(any()) } throws DataIntegrityViolationException("duplicate")

// Verify call count
verify(exactly = 1) { repo.save(any()) }
verify(exactly = 0) { emailService.send(any()) }

// Capture argument
val slot = slot<User>()
every { repo.save(capture(slot)) } returns savedUser
assertThat(slot.captured.email).isEqualTo("expected@example.com")

// Coroutines
coEvery { repo.findById(id) } returns user
coVerify(exactly = 1) { repo.findById(id) }
```

---

## Python (pytest)

### Naming Convention

```python
def test_[behavior]_when_[condition]():
```

```python
def test_returns_user_when_found_by_id(): ...
def test_raises_not_found_when_user_does_not_exist(): ...
def test_does_not_create_user_when_email_already_exists(): ...
```

### TDD Cycle — Unit Test Example

**Requirement**: `UserService.create()` should reject duplicate emails.

**Red**:

```python
# tests/users/test_services.py
import pytest
from unittest.mock import MagicMock
from apps.users.services import UserService


def test_raises_when_email_already_exists():
    repo = MagicMock()
    repo.exists_by_email.return_value = True
    service = UserService(repo)

    with pytest.raises(ValueError, match="already registered"):
        service.create(email="taken@example.com", name="Test")

    repo.save.assert_not_called()
```

Run → fails (`UserService` does not exist).

**Green**:

```python
# apps/users/services.py
class UserService:

    def __init__(self, repository):
        self._repo = repository

    def create(self, *, email: str, name: str):
        if self._repo.exists_by_email(email):
            raise ValueError(f"Email {email!r} is already registered")
        return self._repo.save({"email": email, "name": name})
```

Run → passes.

### pytest with Django and factory-boy

```python
# tests/users/factories.py
import factory
from factory.django import DjangoModelFactory
from apps.users.models import User


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    name = factory.Faker("name")
    is_active = True
```

```python
# conftest.py
import pytest
from pytest_factoryboy import register
from tests.users.factories import UserFactory

register(UserFactory)
```

```python
# tests/users/test_services.py
import pytest
from apps.users.services import UserService


@pytest.mark.django_db
def test_create_user_succeeds_with_unique_email():
    service = UserService()

    user = service.create(email="new@example.com", name="Alice")

    assert user.pk is not None
    assert user.email == "new@example.com"


@pytest.mark.django_db
def test_create_user_raises_when_email_taken(user_factory):
    user_factory(email="taken@example.com")

    with pytest.raises(ValueError, match="already registered"):
        UserService().create(email="taken@example.com", name="Bob")
```

### pytest Fixtures

```python
# conftest.py
import pytest


@pytest.fixture
def authenticated_client(client, user_factory):
    user = user_factory()
    client.force_login(user)
    return client, user


# In test
def test_profile_requires_auth(client):
    response = client.get("/api/profile/")
    assert response.status_code == 401


def test_profile_returns_user_data(authenticated_client):
    client, user = authenticated_client
    response = client.get("/api/profile/")
    assert response.status_code == 200
    assert response.json()["email"] == user.email
```

---

## Next.js / Astro (Vitest + RTL + Playwright)

### Naming Convention

```typescript
it('should [behavior] when [condition]', () => { ... })
describe('ComponentName', () => {
  describe('when [state]', () => {
    it('should [behavior]', () => { ... })
  })
})
```

### TDD Cycle — Component Test Example (Vitest + RTL)

**Requirement**: `<Counter>` increments when the button is clicked.

**Red**:

```typescript
// components/counter.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Counter } from './counter';

describe('Counter', () => {
  it('should display initial count of 0', () => {
    render(<Counter />);
    expect(screen.getByText('Count: 0')).toBeInTheDocument();
  });

  it('should increment count when button is clicked', () => {
    render(<Counter />);
    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
```

Run → fails (component does not exist).

**Green**:

```tsx
// components/counter.tsx
'use client';
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)} aria-label="increment">
        +
      </button>
    </div>
  );
}
```

Run → passes.

**Refactor** — extract `useCounter` hook if logic grows. Run tests → green.

### Vitest Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom';
```

### Server Action Testing

Test Server Actions by calling them directly in unit tests — no HTTP overhead.

```typescript
// app/posts/create/actions.test.ts
import { createPost } from './actions';

vi.mock('@/lib/db', () => ({
  db: {
    post: {
      create: vi.fn(),
    },
  },
}));

describe('createPost', () => {
  it('should return validation error when title is empty', async () => {
    const formData = new FormData();
    formData.set('title', '');
    formData.set('content', 'Some content');

    const result = await createPost(formData);

    expect(result?.error?.title).toBeDefined();
  });
});
```

### E2E Testing with Playwright

Reserve Playwright for critical user flows only. Do not replicate unit test
scenarios in E2E.

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should redirect to login when accessing protected route unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('should show dashboard after successful login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');
  });
});
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run build && npm run start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## CI Integration

Run tests in this order — fail fast on the cheapest failures first:

```text
1. Unit tests          — sub-second feedback; block all subsequent steps on failure
2. Integration tests   — real DB, real HTTP; slower but necessary
3. E2E tests           — slowest; run only on main branch or release branches
```

```yaml
# Example GitHub Actions
jobs:
  test:
    steps:
      - name: Unit tests
        run: npx vitest run --reporter=verbose
      - name: Integration tests
        run: npx vitest run --project=integration
      - name: E2E tests
        if: github.ref == 'refs/heads/main'
        run: npx playwright test
```

**Pipeline rules:**

- A failing unit test blocks the entire pipeline — do not merge broken tests
- E2E tests are expensive; run them on CI but not in pre-commit hooks
- Flaky tests must be fixed or deleted — a test that sometimes passes is worse
  than no test, because it erodes trust in the suite
