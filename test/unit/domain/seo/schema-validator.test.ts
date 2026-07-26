import { describe, expect, test } from 'bun:test';
import { extractJsonLd, validateSchema } from '../../../../src/domain/seo/schema-validator';
import type { AuditCheck } from '../../../../src/domain/seo/seo-types';

const byName = (checks: AuditCheck[], name: string) => checks.find((c) => c.name === name);
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe('domain/seo/schema-validator', () => {
  test('reports missing JSON-LD as an error and returns early', () => {
    const checks = validateSchema('<html><body></body></html>');
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ name: 'json-ld-presence', severity: 'error' });
  });

  test('validates a well-formed Hotel schema and flags recommended gaps', () => {
    const checks = validateSchema(
      ld({ '@type': 'Hotel', name: 'H', address: { streetAddress: '1 St' }, telephone: '+1', image: 'https://x/i.jpg' }),
    );
    expect(byName(checks, 'json-ld-presence')?.severity).toBe('pass');
    expect(byName(checks, 'schema-Hotel')?.severity).toBe('pass');
    expect(byName(checks, 'schema-Hotel-warnings')?.severity).toBe('warning');
  });

  test('flags a Hotel schema missing required properties', () => {
    const checks = validateSchema(ld({ '@type': 'Hotel', name: 'H', address: { foo: 'bar' } }));
    const hotel = byName(checks, 'schema-Hotel');
    expect(hotel?.severity).toBe('error');
    expect(hotel?.message).toContain('telephone');
  });

  test('warns when a Hotel image URL is relative', () => {
    const checks = validateSchema(
      ld({ '@type': 'Hotel', name: 'H', address: { streetAddress: '1' }, telephone: '+1', image: '/rel.jpg' }),
    );
    expect(byName(checks, 'schema-Hotel-warnings')?.message).toContain('absolute');
  });

  test('requires a hotel schema even when supporting schemas exist', () => {
    const checks = validateSchema(ld({ '@type': 'Organization', name: 'Org', url: 'https://x/' }));
    expect(byName(checks, 'hotel-schema')?.severity).toBe('error');
    expect(byName(checks, 'schema-Organization')?.severity).toBe('pass');
  });

  test('flags a supporting schema that is missing required fields', () => {
    const checks = validateSchema(ld({ '@type': 'BreadcrumbList' }));
    expect(byName(checks, 'schema-BreadcrumbList')?.severity).toBe('warning');
  });

  test('marks unknown schema types as info', () => {
    const checks = validateSchema(ld({ '@type': 'Thing' }));
    expect(byName(checks, 'schema-Thing')?.severity).toBe('info');
  });

  describe('extractJsonLd', () => {
    test('returns the parsed JSON-LD blocks', () => {
      const blocks = extractJsonLd(ld({ '@type': 'Hotel', name: 'H' }));
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('Hotel');
    });

    test('ignores invalid JSON-LD', () => {
      expect(extractJsonLd('<script type="application/ld+json">{ not json</script>')).toEqual([]);
    });
  });
});
