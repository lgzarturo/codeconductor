import { describe, expect, test } from 'bun:test';
import { parseSitemapXml } from '../../../../src/infrastructure/parsers/sitemap-parser';

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
  });
});
