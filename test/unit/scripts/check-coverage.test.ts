import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLcovTotals, COVERAGE_FLOOR } from '../../../scripts/check-coverage';

describe('scripts/check-coverage.ts', () => {
  test('parses lcov totals and stays above the 70% floor on a full file', () => {
    const lcov = [
      'SF:src/a.ts',
      'FNF:10',
      'FNH:8',
      'LF:100',
      'LH:80',
      'end_of_record',
    ].join('\n');
    const totals = parseLcovTotals(lcov);
    expect(totals.lines).toBe(0.8);
    expect(totals.functions).toBe(0.8);
    expect(totals.lines).toBeGreaterThanOrEqual(COVERAGE_FLOOR.lines);
  });

  test('flags totals below the floor', () => {
    const lcov = ['SF:src/a.ts', 'FNF:10', 'FNH:1', 'LF:100', 'LH:10', 'end_of_record'].join(
      '\n',
    );
    const totals = parseLcovTotals(lcov);
    expect(totals.lines).toBeLessThan(COVERAGE_FLOOR.lines);
    expect(totals.functions).toBeLessThan(COVERAGE_FLOOR.functions);
  });

  test('bunfig.toml does not set coverageThreshold (bun applies it per-file)', () => {
    const bunfig = readFileSync(join(import.meta.dir, '../../../bunfig.toml'), 'utf-8');
    expect(bunfig).not.toMatch(/^\s*coverageThreshold\s*=/m);
  });
});
