import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const TDD_CYCLE_PATH = 'presets/claude/commands/cc/tdd-cycle.md';
const CLAUDE_MD_PATH = 'presets/claude/CLAUDE.md';

describe('BC-005: seam agreement and anti-pattern checklist in /cc:tdd-cycle', () => {
  test('the flow agrees on seams before any test is written', async () => {
    const content = await readFile(resolve(ROOT, TDD_CYCLE_PATH), 'utf-8');

    const seamHeading = content.search(/### 1a — .*seam/i);
    const writeTestHeading = content.search(/### .* — Write the failing test/i);

    expect(seamHeading, 'seam agreement step must exist').toBeGreaterThan(-1);
    expect(writeTestHeading, 'write-the-failing-test step must exist').toBeGreaterThan(-1);
    expect(seamHeading).toBeLessThan(writeTestHeading);
  });

  test('the Tester role checks the three anti-patterns before declaring tests ready', async () => {
    const content = await readFile(resolve(ROOT, CLAUDE_MD_PATH), 'utf-8');
    const testerSection = content.slice(
      content.search(/### Tester/),
      content.search(/### Reviewer/),
    );

    expect(testerSection).toMatch(/implementation-coupled/i);
    expect(testerSection).toMatch(/tautol[oó]gic/i);
    expect(testerSection).toMatch(/horizontal slicing/i);
  });

  test('the RED phase gate references the anti-pattern checklist before the RED report', async () => {
    const content = await readFile(resolve(ROOT, TDD_CYCLE_PATH), 'utf-8');
    const redPhase = content.slice(
      content.search(/## Phase 1 — RED/),
      content.search(/## Phase 2 — GREEN/),
    );

    const antiPatternHeading = redPhase.search(/anti-pattern checklist/i);
    const redReportHeading = redPhase.search(/\*\*RED Phase Report:\*\*/);

    expect(antiPatternHeading, 'anti-pattern checklist must exist in RED phase').toBeGreaterThan(-1);
    expect(redReportHeading).toBeGreaterThan(-1);
    expect(antiPatternHeading).toBeLessThan(redReportHeading);
    expect(redPhase).toMatch(/implementation-coupled/i);
    expect(redPhase).toMatch(/tautol[oó]gic/i);
    expect(redPhase).toMatch(/horizontal slicing/i);
  });

  test('each cycle enforces red-before-green with a single vertical slice', async () => {
    const content = await readFile(resolve(ROOT, TDD_CYCLE_PATH), 'utf-8');
    const preCheck = content.slice(
      content.search(/## Before you begin/),
      content.search(/## Phase 1 — RED/),
    );

    expect(preCheck).toMatch(/single vertical slice|una sola rebanada vertical/i);
    expect(preCheck).toMatch(/red-before-green|RED.*before.*GREEN/i);
  });
});
