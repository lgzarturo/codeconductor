import { describe, expect, test } from 'bun:test';
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
});
