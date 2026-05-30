import { describe, expect, it } from 'bun:test';
import { validateSchema, extractJsonLd } from '../src/domain/seo/schema-validator';

const HOTEL_HTML = `<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Hotel",
  "name": "Paradise Resort",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Ocean Blvd",
    "addressLocality": "Puerto Vallarta",
    "addressRegion": "Jalisco",
    "addressCountry": "MX"
  },
  "telephone": "+52-322-123-4567",
  "image": "https://example.com/hotel.jpg",
  "priceRange": "$$$",
  "description": "Luxury beachfront resort",
  "url": "https://example.com",
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 20.6534,
    "longitude": -105.2253
  }
}
</script>
</head>
<body></body>
</html>`;

const INVALID_HOTEL_HTML = `<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Hotel",
  "name": "Budget Inn"
}
</script>
</head>
<body></body>
</html>`;

const NO_SCHEMA_HTML = `<html><head></head><body></body></html>`;

const MULTI_SCHEMA_HTML = `<html>
<head>
<script type="application/ld+json">
{
  "@type": "Hotel",
  "name": "Resort",
  "address": { "streetAddress": "123 Main", "addressLocality": "Town" },
  "telephone": "+1-555-0100",
  "image": "https://example.com/img.jpg"
}
</script>
<script type="application/ld+json">
{
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "Check-in time?" }
  ]
}
</script>
<script type="application/ld+json">
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home" }
  ]
}
</script>
</head>
<body></body>
</html>`;

describe('validateSchema', () => {
  it('passes for valid Hotel schema', () => {
    const checks = validateSchema(HOTEL_HTML);

    const presenceCheck = checks.find((c) => c.name === 'json-ld-presence');
    expect(presenceCheck?.severity).toBe('pass');

    const hotelCheck = checks.find((c) => c.name === 'schema-Hotel');
    expect(hotelCheck?.severity).toBe('pass');
  });

  it('detects missing JSON-LD', () => {
    const checks = validateSchema(NO_SCHEMA_HTML);

    const presenceCheck = checks.find((c) => c.name === 'json-ld-presence');
    expect(presenceCheck?.severity).toBe('error');
  });

  it('detects invalid Hotel schema (missing required properties)', () => {
    const checks = validateSchema(INVALID_HOTEL_HTML);

    const hotelCheck = checks.find((c) => c.name === 'schema-Hotel');
    expect(hotelCheck?.severity).toBe('error');
    expect(hotelCheck?.message).toContain('address');
  });

  it('validates multiple schema types', () => {
    const checks = validateSchema(MULTI_SCHEMA_HTML);

    const presenceCheck = checks.find((c) => c.name === 'json-ld-presence');
    expect(presenceCheck?.severity).toBe('pass');
    expect(presenceCheck?.message).toContain('3');

    const hotelCheck = checks.find((c) => c.name === 'schema-Hotel');
    expect(hotelCheck?.severity).toBe('pass');

    const faqCheck = checks.find((c) => c.name === 'schema-FAQPage');
    expect(faqCheck?.severity).toBe('pass');

    const breadcrumbCheck = checks.find((c) => c.name === 'schema-BreadcrumbList');
    expect(breadcrumbCheck?.severity).toBe('pass');
  });

  it('reports missing hotel schema when only supporting types exist', () => {
    const html = `<html><head>
<script type="application/ld+json">{"@type": "BreadcrumbList", "itemListElement": []}</script>
</head><body></body></html>`;

    const checks = validateSchema(html);

    const hotelCheck = checks.find((c) => c.name === 'hotel-schema');
    expect(hotelCheck?.severity).toBe('error');
  });
});

describe('extractJsonLd', () => {
  it('extracts JSON-LD blocks', () => {
    const blocks = extractJsonLd(HOTEL_HTML);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('Hotel');
    expect(blocks[0].properties.name).toBe('Paradise Resort');
  });

  it('returns empty array for no JSON-LD', () => {
    const blocks = extractJsonLd(NO_SCHEMA_HTML);
    expect(blocks).toHaveLength(0);
  });

  it('handles multiple JSON-LD blocks', () => {
    const blocks = extractJsonLd(MULTI_SCHEMA_HTML);
    expect(blocks).toHaveLength(3);
  });

  it('skips invalid JSON', () => {
    const html = `<script type="application/ld+json">{invalid json}</script>`;
    const blocks = extractJsonLd(html);
    expect(blocks).toHaveLength(0);
  });
});
