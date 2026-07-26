import { describe, expect, test } from 'bun:test';
import {
  computeExitCode,
  formatCli,
  formatJson,
  formatMarkdown,
} from '../../../../src/domain/seo/report-formatter';
import type { AuditReport, AuditSummary } from '../../../../src/domain/seo/seo-types';

function report(summary: AuditSummary): AuditReport {
  return {
    target: 'https://example.com',
    timestamp: '2026-07-26T10:00:00Z',
    pages: [
      {
        url: 'https://example.com/',
        responseTime: 120,
        checks: [
          { name: 'title-tag', category: 'meta', severity: 'error', message: 'missing', remediation: 'add title' },
          { name: 'canonical', category: 'meta', severity: 'warning', message: 'weak', remediation: 'add canonical' },
          { name: 'https', category: 'technical', severity: 'pass', message: 'ok' },
          { name: 'og-url', category: 'social', severity: 'info', message: 'missing', remediation: 'add og:url' },
        ],
      },
    ],
    summary,
  };
}

const full = report({ total: 4, passed: 1, warnings: 1, errors: 1, score: 75 });

describe('domain/seo/report-formatter', () => {
  describe('formatCli', () => {
    test('renders header, per-page checks, remediation and summary', () => {
      const out = formatCli(full);
      expect(out).toContain('SEO Audit Report');
      expect(out).toContain('https://example.com/');
      expect(out).toContain('Score: 75%');
      expect(out).toContain('1 passed');
      expect(out).toContain('→ add title');
    });
  });

  describe('formatJson', () => {
    test('is a JSON round-trip of the report', () => {
      expect(JSON.parse(formatJson(full))).toEqual(full);
    });
  });

  describe('formatMarkdown', () => {
    test('emits a summary table and one section per severity', () => {
      const out = formatMarkdown(full);
      expect(out).toContain('# SEO Audit Report');
      expect(out).toContain('| Score | 75% |');
      expect(out).toContain('### Errors');
      expect(out).toContain('### Warnings');
      expect(out).toContain('### Passed');
      expect(out).toContain('### Info');
      expect(out).toContain('Fix: add title');
    });
  });

  describe('computeExitCode', () => {
    test('returns 1 when there are errors', () => {
      expect(computeExitCode(full, 'error')).toBe(1);
    });

    test('returns 2 when failing on warnings and warnings exist', () => {
      const warnOnly = report({ total: 3, passed: 2, warnings: 1, errors: 0, score: 80 });
      expect(computeExitCode(warnOnly, 'warning')).toBe(2);
    });

    test('returns 0 for warnings when only failing on errors', () => {
      const warnOnly = report({ total: 3, passed: 2, warnings: 1, errors: 0, score: 80 });
      expect(computeExitCode(warnOnly, 'error')).toBe(0);
    });

    test('returns 0 for a clean report', () => {
      const clean = report({ total: 3, passed: 3, warnings: 0, errors: 0, score: 100 });
      expect(computeExitCode(clean, 'warning')).toBe(0);
    });
  });
});
