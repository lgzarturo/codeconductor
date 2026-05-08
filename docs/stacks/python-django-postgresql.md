# Stack: Python / Django / PostgreSQL

**Version:** v0.1.0 **Target tools:** OpenCode, Claude Code

---

## Purpose

This document defines the Python / Django / PostgreSQL stack for CodeConductor.
It specifies how the stack is detected, which skills activate, how tests are
run, and what path patterns trigger elevated risk classification.

---

## Detection Signals

Detection follows the framework priority: files > dependencies > scripts.

| Signal                                                     | Inference                 |
| ---------------------------------------------------------- | ------------------------- |
| `manage.py` present                                        | Django project            |
| `pyproject.toml` with `django` in `[project.dependencies]` | Django + Python           |
| `[tool.pytest.ini_options]` in `pyproject.toml`            | pytest as test runner     |
| `django-tenants` in dependencies                           | Multi-tenant architecture |
| `psycopg2` or `psycopg` in dependencies                    | PostgreSQL backend        |
| `apps/` directory with `models.py` files                   | Django app structure      |

All signals are evaluated; the first match is sufficient for Django detection.

---

## Skills

| Context                                | Skill ID              | When to activate                                                |
| -------------------------------------- | --------------------- | --------------------------------------------------------------- |
| Any Python file                        | `python`              | When writing or reviewing Python code                           |
| Views, services, models, API           | `python-django-stack` | When touching `views.py`, `services.py`, `models.py`, `urls.py` |
| ORM queries, bulk ops, DB service code | `django-orm`          | When writing queryset logic, `save()`, signals, migrations      |
| Test files                             | `django-testing`      | Before writing any test in `apps/*/tests/`                      |

Skills are additive — multiple skills can and should be active simultaneously.

---

## Agents Affected

| Agent         | Skills invoked                      | Notes                         |
| ------------- | ----------------------------------- | ----------------------------- |
| `architect`   | `python-django-stack`, `django-orm` | Design patterns for Django    |
| `implementer` | `python-django-stack`, `django-orm` | Implement views and services  |
| `tester`      | `django-testing`                    | Multi-tenant test constraints |
| `reviewer`    | `python`                            | Clean code conventions        |

---

## Test Runner

```bash
make tests                           # primary — recommended
make tests-coverage                  # with coverage report
uv run pytest -v --tb=short         # verbose with short tracebacks
uv run pytest --lf                  # re-run only failed tests
uv run pytest --create-db           # force fresh DB schema
```

**Test configuration** (`pyproject.toml`):

```toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings"
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "--reuse-db --nomigrations -x"
testpaths = ["apps"]
```

---

## TDD Workflow

For this stack, TDD is enforced on all medium and high-risk tasks:

```text
1. Tester writes failing tests
2. Tester confirms: pytest reports FAIL with expected error
3. Implementer receives failing test file path in delegation
4. Implementer runs tests — confirms FAIL
5. Implementer writes minimal code
6. Implementer runs tests — confirms PASS
7. Tester runs full suite: make tests
```

The orchestrator injects this sequence for medium/high tasks. The `implementer`
never writes code without an existing failing test on medium/high tasks.

---

## High-Risk Path Patterns

In addition to the base routing policy, these Django-specific paths trigger
automatic `high` risk classification:

```text
apps/*/migrations/**       # schema changes — always high risk
config/settings*.py        # application configuration
apps/users/**              # user model and authentication
```

---

## Code Quality Commands

```bash
make format    # black + ruff --fix
make lint      # ruff check (read-only)
uv run djlint . --reformat   # HTML templates
```

Pre-commit hooks enforce Black and Ruff automatically. Agents must not bypass
pre-commit hooks.

---

## Known Constraints

### Multi-tenant test isolation

Tests run against the public schema. Tenant app models (`catalog`, `pos`,
`orders`, `cart`, `employees`, `storefront`, `analytics`) do not have tables in
the test database.

**Rule:** Use `SimpleTestCase` + mocks for all tenant app models. Never
`TestCase` for tenant models. See `django-testing` skill for mock patterns.

### Migration strategy

```bash
# Always run both schemas
uv run python manage.py migrate_schemas --shared
uv run python manage.py migrate_schemas --tenant

# Verify no pending migrations
make verifymigrations
```

Migrations are classified `high` risk. The `architect` must review schema
changes before `implementer` runs.

---

## Version History

| Version | Date       | Notes                    |
| ------- | ---------- | ------------------------ |
| v0.1.0  | 2026-05-07 | Initial stack definition |
