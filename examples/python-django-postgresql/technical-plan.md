## Technical Plan

**Task**: Add paginated product listing endpoint (`GET /catalog/api/products/`)
**Approach**: FBV with direct Django ORM query. No DRF. Pagination follows the
offset/limit pattern from `python-django-stack` skill. Tests use
`SimpleTestCase` + mocks because `catalog.Product` is a TENANT_APP model.

**Tradeoffs**:
- Chosen: FBV + direct ORM — consistent with all existing API views in
  `apps/catalog/views.py` and `apps/pos/views.py`
- Rejected: DRF ViewSet — out of scope per Task Card; adds serializer
  abstraction not needed for this endpoint

**Files Affected**:
- `apps/catalog/views.py` — add `api_catalog_products` function
- `apps/catalog/urls.py` — add `path("api/products/", ...)` entry
- `apps/catalog/tests/test_api_catalog_products.py` — create test file

**API Contract**:

```
GET /catalog/api/products/?offset=0&limit=20
Authorization: session (checked by require_manager_access decorator)

200 OK
{
  "results": [
    {
      "id": 1,
      "name": "Lápices de colores",
      "price": "1500.00",
      "stock": 42,
      "is_active": true,
      "category_id": 3
    }
  ],
  "total": 87,
  "has_more": true
}

400 Bad Request (invalid offset or limit)
{"success": false, "error": "Invalid pagination parameters"}
```

**Implementation — `apps/catalog/views.py`**:

```python
@require_manager_access
@require_GET
def api_catalog_products(request):
    offset = safe_int(request.GET.get("offset", 0))
    limit = min(safe_int(request.GET.get("limit", 20), 20), 100)

    qs = Product.objects.filter(is_active=True).order_by("name")
    total = qs.count()
    page = qs[offset:offset + limit]

    results = list(
        page.values("id", "name", "price", "stock", "is_active", "category_id")
    )

    return JsonResponse({
        "results": results,
        "total": total,
        "has_more": (offset + limit) < total,
    })
```

**URL entry — `apps/catalog/urls.py`**:

```python
path("api/products/", api_catalog_products, name="api_catalog_products"),
```

**Test file structure — `apps/catalog/tests/test_api_catalog_products.py`**:

```python
"""
Tests for catalog API — product listing.

NOTE: catalog.Product is TENANT_APP — lives in per-store schema.
Test runner uses public schema. All tests use SimpleTestCase + mocks.
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch
import json

from django.test import RequestFactory, SimpleTestCase

from apps.catalog.views import api_catalog_products


def _create_mock_product(product_id=1, name="Test Product", price="1500.00"):
    mock = MagicMock()
    mock.id = product_id
    mock.name = name
    mock.price = Decimal(price)
    mock.stock = 10
    mock.is_active = True
    mock.category_id = 1
    return mock


class TestApiCatalogProducts(SimpleTestCase):
    """Tests for GET /catalog/api/products/"""

    def _make_request(self, offset=0, limit=20):
        factory = RequestFactory()
        request = factory.get(
            f"/catalog/api/products/?offset={offset}&limit={limit}"
        )
        request.user = MagicMock()
        request.user.is_authenticated = True
        request.user.is_superuser = True
        return request

    @patch("apps.catalog.views.Product")
    def test_returns_active_products_with_pagination(self, mock_product):
        mock_p = _create_mock_product(name="Lápices")
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 1
        mock_qs.__getitem__ = lambda self, s: [mock_p] if isinstance(s, slice) else mock_p
        mock_qs.values.return_value = [
            {"id": 1, "name": "Lápices", "price": "1500.00",
             "stock": 10, "is_active": True, "category_id": 1}
        ]
        mock_product.objects.filter.return_value = mock_qs

        response = api_catalog_products(self._make_request())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertIn("results", data)
        self.assertIn("total", data)
        self.assertIn("has_more", data)
        self.assertEqual(data["total"], 1)
        self.assertFalse(data["has_more"])

    @patch("apps.catalog.views.Product")
    def test_empty_queryset_returns_empty_results(self, mock_product):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 0
        mock_qs.values.return_value = []
        mock_product.objects.filter.return_value = mock_qs

        response = api_catalog_products(self._make_request())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["results"], [])
        self.assertEqual(data["total"], 0)
        self.assertFalse(data["has_more"])

    @patch("apps.catalog.views.Product")
    def test_limit_clamped_to_100(self, mock_product):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 0
        mock_qs.values.return_value = []
        mock_product.objects.filter.return_value = mock_qs

        # Request limit=200, expect it's silently clamped to 100
        response = api_catalog_products(self._make_request(limit=200))
        self.assertEqual(response.status_code, 200)
        # Verify slice used was [0:100], not [0:200]
        mock_qs.__getitem__.assert_called_once_with(slice(0, 100))
```

**Risks**:

- TENANT_APP constraint: `catalog.Product` tables don't exist in the test
  runner's public schema. Mitigation: all tests use `SimpleTestCase` + mocks.
  The `implementer` must not add any `TestCase` tests for this model.
- The `require_manager_access` decorator checks `EmployeeProfile` (also
  TENANT_APP). Mitigation: use `mock_user.is_superuser = True` in all tests to
  bypass the decorator's tenant lookup.

**Acceptance Criteria Validation**:

- Criterion 1: `test_returns_active_products_with_pagination` — response shape
- Criterion 2: `test_limit_clamped_to_100` — limit boundary
- Criterion 3: `test_returns_active_products_with_pagination` — fields in values()
- Criterion 4: `Product.objects.filter(is_active=True)` — ORM filter in view
- Criterion 5: three test methods covering happy path, empty, limit boundary
