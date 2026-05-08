## Task Card

**Objective**: Add a paginated JSON API endpoint `GET /catalog/api/products/`
that returns active catalog products with offset/limit pagination.

**Acceptance Criteria**:

1. `GET /catalog/api/products/` returns HTTP 200 with body:
   `{"results": [...], "total": N, "has_more": bool}`
2. Default `limit` is 20, maximum is 100. Requests with `limit > 100` are
   clamped to 100.
3. Each product in `results` includes: `id`, `name`, `price`, `stock`,
   `is_active`, `category_id`.
4. Products with `is_active=False` are excluded from results.
5. Unit tests cover: happy path (results returned), empty queryset, limit
   boundary (limit=100 clamped), and no tenant model (`SimpleTestCase` + mocks).

**Scope**:

- In: `apps/catalog/views.py`, `apps/catalog/urls.py`,
  `apps/catalog/tests/test_api_catalog_products.py`
- Out: authentication, response caching, DRF serializers, image fields in
  response

**Risk Level**: medium — new public endpoint touching tenant app model
(`catalog.Product` is a TENANT_APP model).

**Context**:

- Files:
  - `apps/catalog/views.py` — existing FBV views
  - `apps/catalog/urls.py` — URL configuration
  - `apps/catalog/tests/` — existing test directory
  - `apps/catalog/models.py` — `Product` model definition
- Services: none (direct ORM query, no service layer for this endpoint)
- Constraints:
  - Must use FBV pattern (not DRF)
  - Must follow `python-django-stack` skill conventions
  - Must use `django-orm` skill for queryset patterns
  - Test must use `SimpleTestCase` + mocks (TENANT_APP constraint)
  - Pagination: offset/limit, never page numbers
  - Never return HTTP 200 with `"success": false`
