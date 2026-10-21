/**
 * Oracle for review-seeded-bug: evaluates the written report, not a code patch.
 * review-target.ts must remain buggy; review-report.md must name the defect.
 *
 * Context-aware: under the eval runner (CODECONDUCTOR_EVAL_RUN=1, set by
 * suite-run.ts) the report must exist and name the defect. In a pristine
 * repo checkout the deliverable must be absent — the fixture ships without it.
 */
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clamp } from './review-target';

const root = import.meta.dir;
const inEvalRun = process.env.CODECONDUCTOR_EVAL_RUN === '1';

test('seeded clamp upper-bound defect is still present (do not patch)', () => {
  // Bug: clamp(max) returns max-1 — report task must NOT fix this.
  expect(clamp(10, 0, 10)).toBe(9);
});

test('review-report.md identifies the clamp upper-bound defect', () => {
  const reportPath = join(root, 'review-report.md');
  if (!inEvalRun) {
    expect(existsSync(reportPath)).toBe(false);
    return;
  }
  const report = readFileSync(reportPath, 'utf-8').toLowerCase();
  expect(report.length).toBeGreaterThan(20);
  expect(report).toMatch(/clamp/);
  const mentionsBound =
    /upper|max|off-?by-?one|n\s*>=\s*max|equals max|cuando n equals|n === max|n == max/.test(
      report,
    );
  expect(mentionsBound).toBe(true);
});
