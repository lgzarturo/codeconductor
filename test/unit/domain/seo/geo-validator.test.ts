import { describe, expect, test } from 'bun:test';
import { validateGeo } from '../../../../src/domain/seo/geo-validator';
import type { AuditCheck } from '../../../../src/domain/seo/seo-types';

const byName = (checks: AuditCheck[], name: string) => checks.find((c) => c.name === name);

const RICH_HTML = `<html><body>
<p>The Grand Plaza Hotel opened in 2021 with 250 rooms, 40 suites near Central Station.</p>
<ul><li>WiFi</li><li>Pool</li></ul>
<details><summary>FAQ</summary><p>An answer</p></details>
<time datetime="2026-01-01">Jan 2026</time>
</body></html>`;

const POOR_HTML = '<p>hi</p>';

describe('domain/seo/geo-validator', () => {
  describe('validateGeo — rich, citable content', () => {
    const checks = validateGeo(RICH_HTML, 'https://example.com');

    test('passes all GEO signals', () => {
      expect(byName(checks, 'citable-content')?.severity).toBe('pass');
      expect(byName(checks, 'structured-lists')?.severity).toBe('pass');
      expect(byName(checks, 'faq-section')?.severity).toBe('pass');
      expect(byName(checks, 'content-freshness')?.severity).toBe('pass');
    });
  });

  describe('validateGeo — thin content', () => {
    const checks = validateGeo(POOR_HTML, 'https://example.com');

    test('warns on missing citable content, lists and FAQ, and notes missing dates', () => {
      expect(byName(checks, 'citable-content')?.severity).toBe('warning');
      expect(byName(checks, 'structured-lists')?.severity).toBe('warning');
      expect(byName(checks, 'faq-section')?.severity).toBe('warning');
      expect(byName(checks, 'content-freshness')?.severity).toBe('info');
    });
  });
});
