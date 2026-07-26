import { describe, expect, test } from 'bun:test';
import { validateMeta } from '../../../../src/domain/seo/meta-validator';
import type { AuditCheck } from '../../../../src/domain/seo/seo-types';

const byName = (checks: AuditCheck[], name: string) => checks.find((c) => c.name === name);

const GOOD_HTML = `<html lang="en"><head>
<title>${'A'.repeat(45)}</title>
<meta name="description" content="${'B'.repeat(130)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://example.com/">
<link rel="alternate" hreflang="es" href="https://example.com/es">
<meta property="og:title" content="T">
<meta property="og:description" content="D">
<meta property="og:image" content="https://example.com/og.jpg">
<meta property="og:url" content="https://example.com/">
<meta name="twitter:card" content="summary_large_image">
</head><body>
<h1>Welcome</h1><h2>Rooms</h2>
<img src="/a.jpg" alt="a room">
<a href="/about">About</a>
</body></html>`;

describe('domain/seo/meta-validator', () => {
  describe('a fully optimized page', () => {
    const checks = validateMeta(GOOD_HTML, 'https://example.com/', 100);

    test('passes the core meta, content and technical checks', () => {
      for (const name of ['title-tag', 'meta-description', 'canonical', 'h1-tag', 'viewport', 'https', 'response-time']) {
        expect(byName(checks, name)?.severity).toBe('pass');
      }
    });

    test('recognizes hreflang and heading hierarchy', () => {
      expect(byName(checks, 'hreflang')?.severity).toBe('pass');
      expect(byName(checks, 'heading-hierarchy')?.severity).toBe('pass');
    });
  });

  describe('an empty document over http', () => {
    const checks = validateMeta('', 'http://x.com', 6000);

    test('flags the critical failures', () => {
      expect(byName(checks, 'title-tag')?.severity).toBe('error');
      expect(byName(checks, 'meta-description')?.severity).toBe('error');
      expect(byName(checks, 'h1-tag')?.severity).toBe('error');
      expect(byName(checks, 'viewport')?.severity).toBe('error');
      expect(byName(checks, 'https')?.severity).toBe('error');
      expect(byName(checks, 'response-time')?.severity).toBe('error');
    });

    test('warns about the softer misses', () => {
      expect(byName(checks, 'canonical')?.severity).toBe('warning');
      expect(byName(checks, 'internal-links')?.severity).toBe('warning');
      expect(byName(checks, 'og-title')?.severity).toBe('warning');
    });
  });

  describe('title length boundaries', () => {
    test('too short is a warning', () => {
      const c = byName(validateMeta(`<title>${'A'.repeat(10)}</title>`, 'https://x/', 10), 'title-tag');
      expect(c?.severity).toBe('warning');
      expect(c?.message).toContain('too short');
    });

    test('too long is a warning', () => {
      const c = byName(validateMeta(`<title>${'A'.repeat(70)}</title>`, 'https://x/', 10), 'title-tag');
      expect(c?.severity).toBe('warning');
      expect(c?.message).toContain('too long');
    });
  });

  describe('description length boundaries', () => {
    test('too short is a warning', () => {
      const c = byName(validateMeta(`<meta name="description" content="${'B'.repeat(50)}">`, 'https://x/', 10), 'meta-description');
      expect(c?.message).toContain('too short');
    });

    test('too long is a warning', () => {
      const c = byName(validateMeta(`<meta name="description" content="${'B'.repeat(200)}">`, 'https://x/', 10), 'meta-description');
      expect(c?.message).toContain('too long');
    });
  });

  describe('other branches', () => {
    test('a canonical that differs from the URL is info', () => {
      const c = byName(validateMeta('<link rel="canonical" href="https://a.com/">', 'https://b.com/', 10), 'canonical');
      expect(c?.severity).toBe('info');
    });

    test('robots noindex/nofollow raise crawl warnings', () => {
      const checks = validateMeta('<meta name="robots" content="noindex, nofollow">', 'https://x/', 10);
      expect(byName(checks, 'robots-noindex')?.severity).toBe('warning');
      expect(byName(checks, 'robots-nofollow')?.severity).toBe('warning');
    });

    test('multiple h1 tags are a warning', () => {
      const c = byName(validateMeta('<h1>A</h1><h1>B</h1>', 'https://x/', 10), 'h1-tag');
      expect(c?.severity).toBe('warning');
      expect(c?.message).toContain('Multiple');
    });

    test('a skipped heading level is a warning', () => {
      const c = byName(validateMeta('<h1>A</h1><h4>B</h4>', 'https://x/', 10), 'heading-hierarchy');
      expect(c?.severity).toBe('warning');
    });

    test('images without alt text raise a warning', () => {
      const c = byName(validateMeta('<img src="x.jpg">', 'https://x/', 10), 'img-alt-text');
      expect(c?.severity).toBe('warning');
    });

    test('a slow (but not fatal) response is a warning', () => {
      const c = byName(validateMeta('', 'https://x/', 4000), 'response-time');
      expect(c?.severity).toBe('warning');
    });
  });
});
