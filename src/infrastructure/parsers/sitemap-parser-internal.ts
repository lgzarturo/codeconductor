import { safeFetch, delay } from '../http/safe-fetch';
import type {
  SafeFetchResponse,
  SitemapEntry,
  SitemapParseResult,
} from '../../domain/seo/seo-types';

const MAX_CHILD_SITEMAPS = 50;
const MAX_URL_RECORDS = 50_000;

/** Limit breaches are explicit failures: they are never truncated nor swallowed. */
class SitemapLimitError extends Error {}

/**
 * Injectable seams for the test suite only. The production module
 * (`sitemap-parser.ts`) re-exports `parseSitemap` without this parameter.
 */
export interface SitemapParserInternals {
  readonly fetchImpl?: (url: string) => Promise<SafeFetchResponse>;
}

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
  if (sitemapBlocks.length > MAX_CHILD_SITEMAPS) {
    throw new SitemapLimitError(
      `Sitemap index exceeds the maximum of ${MAX_CHILD_SITEMAPS} child sitemaps (found ${sitemapBlocks.length})`
    );
  }
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

function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const port = parsed.port !== '' ? parsed.port : parsed.protocol === 'https:' ? '443' : '80';
    return `${parsed.protocol}//${hostname}:${port}`;
  } catch {
    return undefined;
  }
}

function isSameOrigin(childUrl: string, parentUrl: string): boolean {
  const child = originOf(childUrl);
  const parent = originOf(parentUrl);
  return child !== undefined && child === parent;
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

/** Budgets shared by every document reached through one crawl. */
interface CrawlBudget {
  childSitemaps: number;
  urlRecords: number;
}

interface CrawlContext {
  readonly maxDepth: number;
  readonly requestDelay: number;
  readonly fetchImpl: (url: string) => Promise<SafeFetchResponse>;
  readonly budget: CrawlBudget;
}

function chargeChildSitemaps(count: number, budget: CrawlBudget): void {
  budget.childSitemaps += count;
  if (budget.childSitemaps > MAX_CHILD_SITEMAPS) {
    throw new SitemapLimitError(
      `Sitemap crawl exceeds the maximum of ${MAX_CHILD_SITEMAPS} child sitemaps (reached ${budget.childSitemaps})`
    );
  }
}

/**
 * Charges every `<url>` record — duplicates included — against the crawl budget
 * before any entry is materialised, and stops scanning at the first record over
 * the limit.
 */
function chargeUrlRecords(xml: string, budget: CrawlBudget): void {
  const regex = /<url[^>]*>[\s\S]*?<\/url>/gi;
  while (regex.exec(xml) !== null) {
    budget.urlRecords += 1;
    if (budget.urlRecords > MAX_URL_RECORDS) {
      throw new SitemapLimitError(
        `Sitemap crawl exceeds the maximum of ${MAX_URL_RECORDS} urls`
      );
    }
  }
}

export async function parseSitemapWithInternals(
  sitemapUrl: string,
  options: { maxDepth?: number; delay?: number } = {},
  internals: SitemapParserInternals = {}
): Promise<SitemapParseResult> {
  const { maxDepth = 2, delay: requestDelay = 0 } = options;

  return parseSitemapRecursive(sitemapUrl, 0, {
    maxDepth,
    requestDelay,
    fetchImpl: internals.fetchImpl ?? ((url: string) => safeFetch(url)),
    budget: { childSitemaps: 0, urlRecords: 0 },
  });
}

async function parseSitemapRecursive(
  sitemapUrl: string,
  depth: number,
  context: CrawlContext
): Promise<SitemapParseResult> {
  const { maxDepth, requestDelay, budget } = context;
  const response = await context.fetchImpl(sitemapUrl);
  const xml = response.body;
  const domain = getDomain(sitemapUrl);

  const isIndex = /<sitemapindex[\s>]/i.test(xml);

  if (isIndex) {
    const childUrls = parseSitemapLocs(xml);
    chargeChildSitemaps(childUrls.length, budget);

    if (depth >= maxDepth) {
      return {
        entries: [],
        type: 'sitemapindex',
        childSitemaps: childUrls,
      };
    }

    const allEntries: SitemapEntry[] = [];
    const allChildSitemaps: string[] = [...childUrls];
    let fetched = 0;

    for (const childUrl of childUrls) {
      // Cross-origin children are never fetched: the index must not be able to
      // point the crawler at another host.
      if (!isSameOrigin(childUrl, sitemapUrl)) continue;

      if (fetched > 0 && requestDelay > 0) {
        await delay(requestDelay);
      }
      fetched += 1;

      try {
        const childResult = await parseSitemapRecursive(childUrl, depth + 1, context);
        allEntries.push(...childResult.entries);
        allChildSitemaps.push(...childResult.childSitemaps);
      } catch (error) {
        if (error instanceof SitemapLimitError) throw error;
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

  chargeUrlRecords(xml, budget);

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

  chargeUrlRecords(xml, { childSitemaps: 0, urlRecords: 0 });

  const entries = parseUrlEntries(xml);
  return {
    entries: deduplicateEntries(entries),
    type: 'urlset',
    childSitemaps: [],
  };
}
