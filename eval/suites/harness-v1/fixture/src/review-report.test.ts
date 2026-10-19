/**
 * Oracle for review-seeded-bug: evaluates the written report, not a code patch.
 * review-target.ts must remain buggy; review-report.md must name the defect.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clamp } from './review-target';

const root = import.meta.dir;

test('seeded clamp upper-bound defect is still present (do not patch)', () => {
  // Bug: clamp(max) returns max-1 — report task must NOT fix this.
  expect(clamp(10, 0, 10)).toBe(9);
});

test('review-report.md identifies the clamp upper-bound defect', () => {
  const report = readFileSync(join(root, 'review-report.md'), 'utf-8').toLowerCase();
  expect(report.length).toBeGreaterThan(20);
  expect(report).toMatch(/clamp/);
  const mentionsBound =
    /upper|max|off-?by-?one|n\s*>=\s*max|equals max|cuando n equals|n === max|n == max/.test(
      report,
    );
  expect(mentionsBound).toBe(true);
});
