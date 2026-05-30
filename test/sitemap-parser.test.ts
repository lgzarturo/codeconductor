import { describe, expect, it } from 'bun:test';
import { parseSitemapXml } from '../src/infrastructure/parsers/sitemap-parser';

describe('parseSitemapXml', () => {
  it('parses a standard urlset sitemap', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/</loc>
    <lastmod>2026-01-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.example.com/rooms</loc>
    <lastmod>2026-01-02</lastmod>
  </url>
  <url>
    <loc>https://www.example.com/about</loc>
  </url>
</urlset>`;

    const result = parseSitemapXml(xml);

    expect(result.type).toBe('urlset');
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].url).toBe('https://www.example.com/');
    expect(result.entries[0].lastmod).toBe('2026-01-01');
    expect(result.entries[0].changefreq).toBe('daily');
    expect(result.entries[0].priority).toBe('1.0');
    expect(result.entries[1].url).toBe('https://www.example.com/rooms');
    expect(result.entries[2].url).toBe('https://www.example.com/about');
    expect(result.childSitemaps).toHaveLength(0);
  });

  it('parses a sitemapindex', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.example.com/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.example.com/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>`;

    const result = parseSitemapXml(xml);

    expect(result.type).toBe('sitemapindex');
    expect(result.entries).toHaveLength(0);
    expect(result.childSitemaps).toHaveLength(2);
    expect(result.childSitemaps[0]).toBe('https://www.example.com/sitemap-1.xml');
    expect(result.childSitemaps[1]).toBe('https://www.example.com/sitemap-2.xml');
  });

  it('deduplicates URLs', () => {
    const xml = `<urlset>
  <url><loc>https://www.example.com/</loc></url>
  <url><loc>https://www.example.com/</loc></url>
  <url><loc>https://www.example.com/about</loc></url>
</urlset>`;

    const result = parseSitemapXml(xml);

    expect(result.entries).toHaveLength(2);
  });

  it('handles empty urlset', () => {
    const xml = `<urlset></urlset>`;
    const result = parseSitemapXml(xml);

    expect(result.type).toBe('urlset');
    expect(result.entries).toHaveLength(0);
  });

  it('skips url entries without loc', () => {
    const xml = `<urlset>
  <url><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://www.example.com/</loc></url>
</urlset>`;

    const result = parseSitemapXml(xml);
    expect(result.entries).toHaveLength(1);
  });
});
