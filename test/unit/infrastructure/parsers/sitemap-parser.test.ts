import { describe, expect, test } from 'bun:test';
import { parseSitemap } from '../../../../src/infrastructure/parsers/sitemap-parser';
import {
  parseSitemapWithInternals,
  parseSitemapXml,
} from '../../../../src/infrastructure/parsers/sitemap-parser-internal';
import type { SafeFetchResponse } from '../../../../src/domain/seo/seo-types';

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/a</loc>
    <lastmod>2026-01-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url><loc>https://example.com/b</loc></url>
  <url><loc>https://example.com/a</loc></url>
  <url><changefreq>weekly</changefreq></url>
</urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/s1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/s2.xml</loc></sitemap>
</sitemapindex>`;

function buildIndex(childUrls: string[]): string {
  const children = childUrls.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join('');
  return `<sitemapindex>${children}</sitemapindex>`;
}

function buildUrlset(count: number, prefix: string): string {
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    urls.push(`<url><loc>https://example.com/${prefix}${i}</loc></url>`);
  }
  return `<urlset>${urls.join('')}</urlset>`;
}

function buildDuplicateUrlset(count: number): string {
  return `<urlset>${'<url><loc>https://example.com/repeated</loc></url>'.repeat(count)}</urlset>`;
}

function fakeResponse(body: string, url: string): SafeFetchResponse {
  return { status: 200, headers: {}, body, responseTime: 1, url };
}

function fakeFetcher(pages: Record<string, string>): {
  fetchImpl: (url: string) => Promise<SafeFetchResponse>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetchImpl: async (url: string) => {
      calls.push(url);
      const body = pages[url];
      if (body === undefined) throw new Error(`no page for ${url}`);
      return fakeResponse(body, url);
    },
  };
}

describe('infrastructure/parsers/sitemap-parser', () => {
  describe('parseSitemapXml — urlset', () => {
    test('extracts url entries with all optional fields', () => {
      const result = parseSitemapXml(URLSET);
      expect(result.type).toBe('urlset');
      expect(result.childSitemaps).toEqual([]);
      expect(result.entries[0]).toEqual({
        url: 'https://example.com/a',
        lastmod: '2026-01-01',
        changefreq: 'daily',
        priority: '0.8',
      });
    });

    test('drops entries without a loc and de-duplicates repeats', () => {
      const result = parseSitemapXml(URLSET);
      const urls = result.entries.map((e) => e.url);
      expect(urls).toEqual(['https://example.com/a', 'https://example.com/b']);
    });

    test('rejects more than 50000 url records before de-duplication', () => {
      expect(() => parseSitemapXml(buildDuplicateUrlset(50_001))).toThrow(/50000 urls/i);
    });
  });

  describe('parseSitemapXml — sitemapindex', () => {
    test('collects child sitemap locations', () => {
      const result = parseSitemapXml(INDEX);
      expect(result.type).toBe('sitemapindex');
      expect(result.entries).toEqual([]);
      expect(result.childSitemaps).toEqual([
        'https://example.com/s1.xml',
        'https://example.com/s2.xml',
      ]);
    });

    test('accepts an index with exactly 50 children', () => {
      const children = Array.from({ length: 50 }, (_, i) => `https://example.com/s${i}.xml`);
      const result = parseSitemapXml(buildIndex(children));
      expect(result.childSitemaps).toHaveLength(50);
    });

    test('throws instead of truncating an index with more than 50 children', () => {
      const children = Array.from({ length: 51 }, (_, i) => `https://example.com/s${i}.xml`);
      expect(() => parseSitemapXml(buildIndex(children))).toThrow(/50 child sitemaps/i);
    });
  });

  describe('public API', () => {
    test('drops a cast third-arg fetchImpl bypass at runtime', async () => {
      const { fetchImpl, calls } = fakeFetcher({
        'https://localhost/sitemap.xml': buildUrlset(1, 'public-'),
      });
      const bypass = parseSitemap as unknown as (
        url: string,
        options?: object,
        internals?: object
      ) => ReturnType<typeof parseSitemap>;

      // localhost is blocked by the SSRF guard synchronously, before any real
      // network I/O — this keeps the assertion deterministic across
      // environments instead of depending on a live call to a real host.
      await expect(bypass('https://localhost/sitemap.xml', {}, { fetchImpl })).rejects.toThrow();
      expect(calls).toEqual([]);
    });
  });

  describe('parseSitemap — recursion limits', () => {
    test('propagates the child-count limit and stops fetching', async () => {
      const children = Array.from({ length: 51 }, (_, i) => `https://example.com/s${i}.xml`);
      const { fetchImpl, calls } = fakeFetcher({
        'https://example.com/sitemap.xml': buildIndex(children),
      });

      await expect(
        parseSitemapWithInternals('https://example.com/sitemap.xml', {}, { fetchImpl })
      ).rejects.toThrow(/50 child sitemaps/i);
      expect(calls).toEqual(['https://example.com/sitemap.xml']);
    });

    test('does not silence a limit error raised inside a child sitemap', async () => {
      const nestedChildren = Array.from(
        { length: 51 },
        (_, i) => `https://example.com/deep-${i}.xml`
      );
      const { fetchImpl } = fakeFetcher({
        'https://example.com/sitemap.xml': buildIndex(['https://example.com/child.xml']),
        'https://example.com/child.xml': buildIndex(nestedChildren),
      });

      await expect(
        parseSitemapWithInternals('https://example.com/sitemap.xml', { maxDepth: 3 }, { fetchImpl })
      ).rejects.toThrow(/50 child sitemaps/i);
    });

    test('enforces the 50-child budget globally across recursive indexes', async () => {
      const aChildren = Array.from(
        { length: 25 },
        (_, i) => `https://example.com/a-${i}.xml`
      );
      const bChildren = Array.from(
        { length: 25 },
        (_, i) => `https://example.com/b-${i}.xml`
      );
      const { fetchImpl } = fakeFetcher({
        'https://example.com/sitemap.xml': buildIndex([
          'https://example.com/a.xml',
          'https://example.com/b.xml',
        ]),
        'https://example.com/a.xml': buildIndex(aChildren),
        'https://example.com/b.xml': buildIndex(bChildren),
      });

      await expect(
        parseSitemapWithInternals('https://example.com/sitemap.xml', { maxDepth: 3 }, { fetchImpl })
      ).rejects.toThrow(/50 child sitemaps/i);
    });

    test('still skips a child that fails with an ordinary error', async () => {
      const { fetchImpl } = fakeFetcher({
        'https://example.com/sitemap.xml': buildIndex([
          'https://example.com/missing.xml',
          'https://example.com/ok.xml',
        ]),
        'https://example.com/ok.xml': buildUrlset(2, 'ok-'),
      });

      const result = await parseSitemapWithInternals(
        'https://example.com/sitemap.xml',
        {},
        { fetchImpl }
      );
      expect(result.entries.map((e) => e.url)).toEqual([
        'https://example.com/ok-0',
        'https://example.com/ok-1',
      ]);
    });

    test('does not fetch a cross-domain child sitemap before same-origin filtering', async () => {
      const foreignChild = 'https://attacker.example.net/sitemap.xml';
      const { fetchImpl, calls } = fakeFetcher({
        'https://example.com/sitemap.xml': buildIndex([foreignChild]),
        [foreignChild]: buildUrlset(1, 'foreign-'),
      });

      await parseSitemapWithInternals('https://example.com/sitemap.xml', {}, { fetchImpl });

      expect(calls).toEqual(['https://example.com/sitemap.xml']);
    });

    test('accepts exactly 50000 unique urls across the recursion', async () => {
      const { fetchImpl } = fakeFetcher({
        'https://example.com/sitemap.xml': buildIndex([
          'https://example.com/a.xml',
          'https://example.com/b.xml',
        ]),
        'https://example.com/a.xml': buildUrlset(25_000, 'a-'),
        'https://example.com/b.xml': buildUrlset(25_000, 'b-'),
      });

      const result = await parseSitemapWithInternals(
        'https://example.com/sitemap.xml',
        {},
        { fetchImpl }
      );
      expect(result.entries).toHaveLength(50_000);
    });

    test('throws and stops fetching once 50000 unique urls are exceeded', async () => {
      const { fetchImpl, calls } = fakeFetcher({
        'https://example.com/sitemap.xml': buildIndex([
          'https://example.com/a.xml',
          'https://example.com/b.xml',
          'https://example.com/c.xml',
        ]),
        'https://example.com/a.xml': buildUrlset(26_000, 'a-'),
        'https://example.com/b.xml': buildUrlset(26_000, 'b-'),
        'https://example.com/c.xml': buildUrlset(10, 'c-'),
      });

      await expect(
        parseSitemapWithInternals('https://example.com/sitemap.xml', {}, { fetchImpl })
      ).rejects.toThrow(/50000 urls/i);
      expect(calls).not.toContain('https://example.com/c.xml');
    });

    test('counts duplicate url records toward the 50000-url processing budget', async () => {
      const { fetchImpl } = fakeFetcher({
        'https://example.com/sitemap.xml': buildDuplicateUrlset(50_001),
      });

      await expect(
        parseSitemapWithInternals('https://example.com/sitemap.xml', {}, { fetchImpl })
      ).rejects.toThrow(/50000 urls/i);
    });
  });
});
