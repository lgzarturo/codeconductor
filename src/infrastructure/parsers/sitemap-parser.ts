import { safeFetch, delay } from '../http/safe-fetch';
import type { SitemapEntry, SitemapParseResult } from '../../domain/seo/seo-types';

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : undefined;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function parseUrlEntries(xml: string): SitemapEntry[] {
  const urlBlocks = extractAllBlocks(xml, 'url');
  return urlBlocks.map((block) => ({
    url: extractTag(block, 'loc') ?? '',
    lastmod: extractTag(block, 'lastmod'),
    changefreq: extractTag(block, 'changefreq'),
    priority: extractTag(block, 'priority'),
  })).filter((entry) => entry.url.length > 0);
}

function parseSitemapLocs(xml: string): string[] {
  const sitemapBlocks = extractAllBlocks(xml, 'sitemap');
  return sitemapBlocks
    .map((block) => extractTag(block, 'loc'))
    .filter((loc): loc is string => loc !== undefined && loc.length > 0);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function deduplicateEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}

function filterSameDomain(entries: SitemapEntry[], domain: string): SitemapEntry[] {
  return entries.filter((entry) => {
    try {
      return new URL(entry.url).hostname === domain;
    } catch {
      return false;
    }
  });
}

export async function parseSitemap(
  sitemapUrl: string,
  options: { maxDepth?: number; delay?: number } = {}
): Promise<SitemapParseResult> {
  const { maxDepth = 2, delay: requestDelay = 0 } = options;

  return parseSitemapRecursive(sitemapUrl, 0, maxDepth, requestDelay);
}

async function parseSitemapRecursive(
  sitemapUrl: string,
  depth: number,
  maxDepth: number,
  requestDelay: number
): Promise<SitemapParseResult> {
  const response = await safeFetch(sitemapUrl);
  const xml = response.body;
  const domain = getDomain(sitemapUrl);

  const isIndex = /<sitemapindex[\s>]/i.test(xml);

  if (isIndex) {
    const childUrls = parseSitemapLocs(xml);

    if (depth >= maxDepth) {
      return {
        entries: [],
        type: 'sitemapindex',
        childSitemaps: childUrls,
      };
    }

    const allEntries: SitemapEntry[] = [];
    const allChildSitemaps: string[] = [...childUrls];

    for (let i = 0; i < childUrls.length; i++) {
      if (i > 0 && requestDelay > 0) {
        await delay(requestDelay);
      }
      try {
        const childResult = await parseSitemapRecursive(
          childUrls[i],
          depth + 1,
          maxDepth,
          requestDelay
        );
        allEntries.push(...childResult.entries);
        allChildSitemaps.push(...childResult.childSitemaps);
      } catch {
        // Skip failed child sitemaps
      }
    }

    const deduped = deduplicateEntries(allEntries);
    const filtered = domain ? filterSameDomain(deduped, domain) : deduped;

    return {
      entries: filtered,
      type: 'sitemapindex',
      childSitemaps: allChildSitemaps,
    };
  }

  const entries = parseUrlEntries(xml);
  const deduped = deduplicateEntries(entries);
  const filtered = domain ? filterSameDomain(deduped, domain) : deduped;

  return {
    entries: filtered,
    type: 'urlset',
    childSitemaps: [],
  };
}

export function parseSitemapXml(xml: string): SitemapParseResult {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);

  if (isIndex) {
    const childUrls = parseSitemapLocs(xml);
    return {
      entries: [],
      type: 'sitemapindex',
      childSitemaps: childUrls,
    };
  }

  const entries = parseUrlEntries(xml);
  return {
    entries: deduplicateEntries(entries),
    type: 'urlset',
    childSitemaps: [],
  };
}
