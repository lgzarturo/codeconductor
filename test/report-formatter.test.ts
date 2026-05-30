import { describe, expect, it } from 'bun:test';
import { formatMarkdown, formatJson, computeExitCode } from '../src/domain/seo/report-formatter';
import type { AuditReport } from '../src/domain/seo/seo-types';

const MOCK_REPORT: AuditReport = {
  target: 'https://example.com/sitemap.xml',
  timestamp: '2026-05-29T12:00:00.000Z',
  pages: [
    {
      url: 'https://example.com/',
      checks: [
        { name: 'title-tag', category: 'meta', severity: 'pass', message: 'Title OK (45 chars)' },
        { name: 'meta-description', category: 'meta', severity: 'error', message: 'Missing meta description', remediation: 'Add a meta description' },
        { name: 'og-title', category: 'social', severity: 'warning', message: 'Missing og:title' },
        { name: 'https', category: 'technical', severity: 'pass', message: 'HTTPS enabled' },
      ],
      responseTime: 1200,
    },
  ],
  summary: {
    total: 4,
    passed: 2,
    warnings: 1,
    errors: 1,
    score: 50,
  },
};

describe('formatMarkdown', () => {
  it('generates valid markdown report', () => {
    const md = formatMarkdown(MOCK_REPORT);

    expect(md).toContain('# SEO Audit Report');
    expect(md).toContain('https://example.com/sitemap.xml');
    expect(md).toContain('50%');
    expect(md).toContain('### Errors');
    expect(md).toContain('meta-description');
    expect(md).toContain('### Warnings');
    expect(md).toContain('og-title');
    expect(md).toContain('### Passed');
    expect(md).toContain('title-tag');
  });
});

describe('formatJson', () => {
  it('produces valid JSON', () => {
    const json = formatJson(MOCK_REPORT);
    const parsed = JSON.parse(json);

    expect(parsed.target).toBe('https://example.com/sitemap.xml');
    expect(parsed.summary.score).toBe(50);
    expect(parsed.pages).toHaveLength(1);
  });
});

describe('computeExitCode', () => {
  it('returns 1 when errors exist', () => {
    expect(computeExitCode(MOCK_REPORT, 'error')).toBe(1);
  });

  it('returns 2 when warnings exist and failOn is warning', () => {
    const noErrors: AuditReport = {
      ...MOCK_REPORT,
      pages: [{
        ...MOCK_REPORT.pages[0],
        checks: MOCK_REPORT.pages[0].checks.filter((c) => c.severity !== 'error'),
      }],
      summary: { ...MOCK_REPORT.summary, errors: 0 },
    };
    expect(computeExitCode(noErrors, 'warning')).toBe(2);
  });

  it('returns 0 when no errors and failOn is error', () => {
    const noErrors: AuditReport = {
      ...MOCK_REPORT,
      pages: [{
        ...MOCK_REPORT.pages[0],
        checks: MOCK_REPORT.pages[0].checks.filter((c) => c.severity !== 'error'),
      }],
      summary: { ...MOCK_REPORT.summary, errors: 0 },
    };
    expect(computeExitCode(noErrors, 'error')).toBe(0);
  });

  it('returns 0 when all pass', () => {
    const allPass: AuditReport = {
      ...MOCK_REPORT,
      pages: [{
        ...MOCK_REPORT.pages[0],
        checks: MOCK_REPORT.pages[0].checks.filter((c) => c.severity === 'pass'),
      }],
      summary: { total: 2, passed: 2, warnings: 0, errors: 0, score: 100 },
    };
    expect(computeExitCode(allPass, 'error')).toBe(0);
    expect(computeExitCode(allPass, 'warning')).toBe(0);
  });
});
