import type { AuditCheck } from './seo-types';
import { safeFetch } from '../../infrastructure/http/safe-fetch';

function hasFactualStatements(html: string): boolean {
  const bodyText = html.replace(/<[^>]*>/g, ' ');
  const numberPattern = /\d{2,}/g;
  const datePattern = /\b(20\d{2}|19\d{2})\b/g;
  const properNounPattern = /\b[A-Z][a-z]{2,}\b/g;

  const numbers = bodyText.match(numberPattern) ?? [];
  const dates = bodyText.match(datePattern) ?? [];
  const properNouns = bodyText.match(properNounPattern) ?? [];

  return numbers.length >= 3 || dates.length >= 1 || properNouns.length >= 5;
}

function countStructuredLists(html: string): number {
  const ulMatches = html.match(/<ul[^>]*>/gi) ?? [];
  const olMatches = html.match(/<ol[^>]*>/gi) ?? [];
  const dlMatches = html.match(/<dl[^>]*>/gi) ?? [];
  return ulMatches.length + olMatches.length + dlMatches.length;
}

function hasFaqSection(html: string): boolean {
  const patterns = [
    /faqpage/i,
    /<details[^>]*>/i,
    /id=["'][^"']*faq[^"']*["']/i,
    /class=["'][^"']*faq[^"']*["']/i,
    /<h[2-4][^>]*>.*(?:faq|frequently asked)/i,
  ];
  return patterns.some((p) => p.test(html));
}

function hasContentDates(html: string): boolean {
  const timeRegex = /<time[^>]*datetime=["']([^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = timeRegex.exec(html)) !== null) {
    return true;
  }

  const datePattern = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i;
  return datePattern.test(html);
}

export function validateGeo(html: string, url: string): AuditCheck[] {
  const checks: AuditCheck[] = [];

  if (hasFactualStatements(html)) {
    checks.push({
      name: 'citable-content',
      category: 'geo',
      severity: 'pass',
      message: 'Page contains factual statements suitable for AI citation',
    });
  } else {
    checks.push({
      name: 'citable-content',
      category: 'geo',
      severity: 'warning',
      message: 'Page lacks factual statements (numbers, dates, proper nouns) for AI citation',
      remediation: 'Add specific facts, numbers, and named entities that AI assistants can cite.',
    });
  }

  const listCount = countStructuredLists(html);
  if (listCount > 0) {
    checks.push({
      name: 'structured-lists',
      category: 'geo',
      severity: 'pass',
      message: `Found ${listCount} structured list(s) (ul/ol/dl)`,
    });
  } else {
    checks.push({
      name: 'structured-lists',
      category: 'geo',
      severity: 'warning',
      message: 'No structured lists found',
      remediation: 'Add <ul> or <ol> lists for amenities, features, and services. AI tools extract structured lists for citations.',
    });
  }

  if (hasFaqSection(html)) {
    checks.push({
      name: 'faq-section',
      category: 'geo',
      severity: 'pass',
      message: 'FAQ section detected',
    });
  } else {
    checks.push({
      name: 'faq-section',
      category: 'geo',
      severity: 'warning',
      message: 'No FAQ section found',
      remediation: 'Add an FAQ section with FAQPage schema. AI search tools prioritize Q&A formatted content.',
    });
  }

  if (hasContentDates(html)) {
    checks.push({
      name: 'content-freshness',
      category: 'geo',
      severity: 'pass',
      message: 'Content has date signals',
    });
  } else {
    checks.push({
      name: 'content-freshness',
      category: 'geo',
      severity: 'info',
      message: 'No date signals found in content',
      remediation: 'Add <time> elements or visible dates to signal content freshness.',
    });
  }

  return checks;
}

export async function checkLlmsTxt(baseUrl: string): Promise<AuditCheck[]> {
  const checks: AuditCheck[] = [];

  let root: string;
  try {
    const parsed = new URL(baseUrl);
    root = `${parsed.protocol}//${parsed.host}`;
  } catch {
    return [{
      name: 'llms-txt',
      category: 'geo',
      severity: 'error',
      message: `Invalid base URL: ${baseUrl}`,
    }];
  }

  try {
    const response = await safeFetch(`${root}/llms.txt`);
    if (response.status === 200 && response.body.length > 0) {
      checks.push({
        name: 'llms-txt',
        category: 'geo',
        severity: 'pass',
        message: `llms.txt found (${response.body.length} bytes)`,
      });

      if (!response.body.startsWith('#')) {
        checks.push({
          name: 'llms-txt-format',
          category: 'geo',
          severity: 'warning',
          message: 'llms.txt should start with a # heading',
          remediation: 'Format: # Site Name\\n> Description\\n\\n## Pages\\n- [Title](url): description',
        });
      } else {
        checks.push({
          name: 'llms-txt-format',
          category: 'geo',
          severity: 'pass',
          message: 'llms.txt format looks correct',
        });
      }
    } else {
      checks.push({
        name: 'llms-txt',
        category: 'geo',
        severity: 'error',
        message: `llms.txt returned status ${response.status}`,
        remediation: 'Create a llms.txt file at the site root following the llms.txt specification.',
      });
    }
  } catch {
    checks.push({
      name: 'llms-txt',
      category: 'geo',
      severity: 'error',
      message: 'llms.txt not found or unreachable',
      remediation: 'Create a llms.txt file at the site root. Use `codeconductor seo llms` to generate one.',
    });
  }

  try {
    const response = await safeFetch(`${root}/llms-full.txt`);
    if (response.status === 200 && response.body.length > 0) {
      checks.push({
        name: 'llms-full-txt',
        category: 'geo',
        severity: 'pass',
        message: `llms-full.txt found (${response.body.length} bytes)`,
      });
    }
  } catch {
    checks.push({
      name: 'llms-full-txt',
      category: 'geo',
      severity: 'info',
      message: 'llms-full.txt not found (optional)',
      remediation: 'Consider creating llms-full.txt with extended content for AI tools.',
    });
  }

  return checks;
}
