import { parseSitemapWithInternals } from './sitemap-parser-internal';
import type { SitemapParseResult } from '../../domain/seo/seo-types';

export { parseSitemapXml } from './sitemap-parser-internal';

/**
 * Production surface of the recursive sitemap crawl. The implementation in
 * `sitemap-parser-internal.ts` carries a third argument with the test-only
 * fetch seam; this wrapper forwards only the production arguments, so every
 * crawl goes through the SSRF-guarded fetch.
 */
export async function parseSitemap(
  sitemapUrl: string,
  options: { maxDepth?: number; delay?: number } = {}
): Promise<SitemapParseResult> {
  return parseSitemapWithInternals(sitemapUrl, options);
}
