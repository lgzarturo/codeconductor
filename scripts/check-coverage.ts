#!/usr/bin/env bun
/**
 * Fail CI when overall lcov coverage drops below the declared floor.
 * bunfig.toml coverageThreshold is kept as the documented ratchet; this
 * script enforces the aggregate number bun 1.4 does not.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const LCOV = join(ROOT, 'coverage/lcov.info');
export const COVERAGE_FLOOR = { lines: 0.7, functions: 0.7 } as const;

export function parseLcovTotals(lcov: string): {
  readonly lines: number;
  readonly functions: number;
} {
  let lf = 0;
  let lh = 0;
  let fnf = 0;
  let fnh = 0;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('LF:')) lf += Number(line.slice(3));
    else if (line.startsWith('LH:')) lh += Number(line.slice(3));
    else if (line.startsWith('FNF:')) fnf += Number(line.slice(4));
    else if (line.startsWith('FNH:')) fnh += Number(line.slice(4));
  }
  return {
    lines: lf === 0 ? 1 : lh / lf,
    functions: fnf === 0 ? 1 : fnh / fnf,
  };
}

async function main(): Promise<void> {
  let lcov: string;
  try {
    lcov = await readFile(LCOV, 'utf-8');
  } catch {
    process.stderr.write(`coverage: missing ${LCOV}. Run bun test --coverage first.\n`);
    process.exit(1);
    return;
  }
  const totals = parseLcovTotals(lcov);
  const failures: string[] = [];
  if (totals.lines < COVERAGE_FLOOR.lines) {
    failures.push(
      `lines ${(totals.lines * 100).toFixed(1)}% < ${(COVERAGE_FLOOR.lines * 100).toFixed(0)}%`,
    );
  }
  if (totals.functions < COVERAGE_FLOOR.functions) {
    failures.push(
      `functions ${(totals.functions * 100).toFixed(1)}% < ${(COVERAGE_FLOOR.functions * 100).toFixed(0)}%`,
    );
  }
  if (failures.length > 0) {
    process.stderr.write(`coverage: below floor (${failures.join(', ')})\n`);
    process.exit(1);
  }
  process.stdout.write(
    `coverage: ok lines=${(totals.lines * 100).toFixed(1)}% functions=${(totals.functions * 100).toFixed(1)}% (floor 70%)\n`,
  );
}

if (import.meta.main) {
  await main();
}
