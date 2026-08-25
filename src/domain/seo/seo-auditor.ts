import { safeFetch, delay } from '../../infrastructure/http/safe-fetch';
import { parseSitemap } from '../../infrastructure/parsers/sitemap-parser';
import { validateMeta } from './meta-validator';
import { validateSchema } from './schema-validator';
import { validateGeo, checkLlmsTxt } from './geo-validator';
import type {
  AuditCheck,
  AuditReport,
  AuditSummary,
  PageAuditResult,
  SitemapEntry,
} from './seo-types';

const HOST_CONCURRENCY = 4;

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function computeSummary(pages: PageAuditResult[]): AuditSummary {
  let passed = 0;
  let warnings = 0;
  let errors = 0;
  let total = 0;

  for (const page of pages) {
    for (const check of page.checks) {
      total++;
      if (check.severity === 'pass') passed++;
      else if (check.severity === 'warning' || check.severity === 'info') warnings++;
      else if (check.severity === 'error') errors++;
    }
  }

  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  return { total, passed, warnings, errors, score };
}

export async function auditSingleUrl(
  url: string,
  options: { followRedirects?: boolean } = {}
): Promise<PageAuditResult> {
  const response = await safeFetch(url, {
    followRedirects: options.followRedirects ?? false,
  });

  const html = response.body;
  const checks: AuditCheck[] = [];

  checks.push(...validateMeta(html, url, response.responseTime));
  checks.push(...validateSchema(html));
  checks.push(...validateGeo(html, url));

  return {
    url,
    checks,
    responseTime: response.responseTime,
  };
}

export async function auditSitemap(
  sitemapUrl: string,
  options: { delay?: number; followRedirects?: boolean; maxUrls?: number; onProgress?: (current: number, total: number, url: string) => void } = {}
): Promise<AuditReport> {
  const { delay: requestDelay = 500, followRedirects = false, maxUrls, onProgress } = options;

  const sitemapResult = await parseSitemap(sitemapUrl, { delay: requestDelay });

  let entries: SitemapEntry[] = sitemapResult.entries;
  if (maxUrls && entries.length > maxUrls) {
    entries = entries.slice(0, maxUrls);
  }

  const groups = new Map<string, SitemapEntry[]>();
  for (const entry of entries) {
    const host = hostOf(entry.url);
    const list = groups.get(host) ?? [];
    list.push(entry);
    groups.set(host, list);
  }

  const pagesByUrl = new Map<string, PageAuditResult>();
  let progress = 0;

  await mapLimit([...groups.values()], HOST_CONCURRENCY, async (hostEntries) => {
    for (let i = 0; i < hostEntries.length; i++) {
      const entry = hostEntries[i]!;
      if (i > 0 && requestDelay > 0) {
        await delay(requestDelay);
      }
      progress += 1;
      onProgress?.(progress, entries.length, entry.url);
      try {
        pagesByUrl.set(entry.url, await auditSingleUrl(entry.url, { followRedirects }));
      } catch (error) {
        pagesByUrl.set(entry.url, {
          url: entry.url,
          checks: [{
            name: 'fetch-error',
            category: 'technical',
            severity: 'error',
            message: `Failed to fetch: ${String(error)}`,
          }],
          responseTime: 0,
        });
      }
    }
  });

  const pages: PageAuditResult[] = entries.map(
    (entry) => pagesByUrl.get(entry.url)!,
  );

  try {
    let siteRoot: string;
    try {
      const parsed = new URL(sitemapUrl);
      siteRoot = `${parsed.protocol}//${parsed.host}`;
    } catch {
      siteRoot = sitemapUrl;
    }
    const llmsChecks = await checkLlmsTxt(siteRoot);
    if (pages.length > 0) {
      pages[0] = {
        ...pages[0],
        checks: [...pages[0].checks, ...llmsChecks],
      };
    }
  } catch {
    // llms.txt check failure is non-critical
  }

  const summary = computeSummary(pages);

  return {
    target: sitemapUrl,
    timestamp: new Date().toISOString(),
    pages,
    summary,
  };
}

export async function auditUrl(
  url: string,
  options: { followRedirects?: boolean } = {}
): Promise<AuditReport> {
  const page = await auditSingleUrl(url, options);

  try {
    const llmsChecks = await checkLlmsTxt(url);
    page.checks.push(...llmsChecks);
  } catch {
    // non-critical
  }

  const summary = computeSummary([page]);

  return {
    target: url,
    timestamp: new Date().toISOString(),
    pages: [page],
    summary,
  };
}
