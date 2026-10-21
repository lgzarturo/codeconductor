import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../src/cli/router';
import { generateMutants, runMutationGate } from '../../../src/core/verification/mutation-runner';

const MATH = `export function isPositive(n: number): boolean {
  return n > 0;
}

export function clamp(v: number): number {
  if (v > 100) return 100;
  return v;
}
`;

const STRONG_TEST = `import { expect, test } from 'bun:test';
import { isPositive, clamp } from './src/math';
test('isPositive', () => {
  expect(isPositive(5)).toBe(true);
  expect(isPositive(-3)).toBe(false);
});
test('clamp', () => {
  expect(clamp(150)).toBe(100);
  expect(clamp(50)).toBe(50);
});
`;

const WEAK_TEST = `import { expect, test } from 'bun:test';
test('placeholder', () => {
  expect(true).toBe(true);
});
`;

describe('tdd mutation gate', () => {
  let dir: string;

  async function makeProj(testFile: string, testContent: string): Promise<void> {
    dir = resolve(tmpdir(), `cc-mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'math.ts'), MATH);
    await writeFile(join(dir, testFile), testContent);
  }

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('generateMutants swaps operators deterministically, skipping strings and arrows', () => {
    const mutants = generateMutants(
      'const label = "a > b";\nconst f = (x: number): boolean => x > 0 && y !== z;\nlet i = 0;\ni++;\n',
      's.ts',
    );
    expect(mutants.map((m) => `${m.line}:${m.originalOp}->${m.mutatedOp}`)).toEqual([
      '2:>-><=',
      '2:&&->||',
      '2:!==->===',
    ]);
    expect(mutants[0]?.id).toBe('MUT_000_L2');
  });

  test('strong suite kills every mutant and restores the source', async () => {
    await makeProj('check.test.ts', STRONG_TEST);
    const result = await runMutationGate(dir, {
      target: 'src/math.ts',
      testCommand: 'bun test check.test.ts',
      timeoutMs: 30000,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe('PASS');
    if (result.data.status !== 'PASS') return;
    expect(result.data.killed).toBe(2);
    expect(result.data.score).toBe(100);
    expect(await readFile(join(dir, 'src', 'math.ts'), 'utf-8')).toBe(MATH);
  });

  test('blind suite triggers HANDS_OFF with survivor evidence and restores', async () => {
    await makeProj('weak.test.ts', WEAK_TEST);
    const result = await runMutationGate(dir, {
      target: 'src/math.ts',
      testCommand: 'bun test weak.test.ts',
      timeoutMs: 30000,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe('HANDS_OFF');
    if (result.data.status !== 'HANDS_OFF') return;
    expect(result.data.survivor.id).toBe('MUT_000_L2');
    expect(result.data.survivor.diff).toContain('return n <= 0;');
    expect(result.data.handoverMarkdown).toContain('Real Coverage: 0');
    expect(await readFile(join(dir, 'src', 'math.ts'), 'utf-8')).toBe(MATH);
  });

  test('failing base suite aborts before mutating', async () => {
    await makeProj(
      'broken.test.ts',
      `import { expect, test } from 'bun:test';\ntest('broken', () => { expect(1).toBe(2); });\n`,
    );
    const result = await runMutationGate(dir, {
      target: 'src/math.ts',
      testCommand: 'bun test broken.test.ts',
      timeoutMs: 30000,
    });
    expect(result.success).toBe(false);
    expect(await readFile(join(dir, 'src', 'math.ts'), 'utf-8')).toBe(MATH);
  });

  test('non-allowlisted commands need explicit trust', async () => {
    await makeProj('check.test.ts', STRONG_TEST);
    const denied = await runMutationGate(dir, {
      target: 'src/math.ts',
      testCommand: 'bun --version',
    });
    expect(denied.success).toBe(false);
    const trusted = await runMutationGate(dir, {
      target: 'src/math.ts',
      testCommand: 'bun --version',
      allowCompileCheck: true,
      timeoutMs: 30000,
    });
    expect(trusted.success && trusted.data.status).toBe('HANDS_OFF');
  });

  test('timed-out suites count as killed', async () => {
    dir = resolve(tmpdir(), `cc-mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(
      join(dir, 'src', 'loop.ts'),
      'export function loop(): number {\n  let i = 0;\n  while (i < 10) {\n    i = i + 1;\n  }\n  return i;\n}\n',
    );
    await writeFile(
      join(dir, 'loop.test.ts'),
      `import { expect, test } from 'bun:test';\nimport { loop } from './src/loop';\ntest('loop', () => { expect(loop()).toBe(10); });\n`,
    );
    const result = await runMutationGate(dir, {
      target: 'src/loop.ts',
      testCommand: 'bun test loop.test.ts',
      timeoutMs: 2000,
    });
    expect(result.success).toBe(true);
    if (!result.success || result.data.status !== 'PASS') return;
    expect(result.data.timeouts).toBe(1);
    expect(result.data.killed).toBe(2);
    expect(await readFile(join(dir, 'src', 'loop.ts'), 'utf-8')).toContain('i = i + 1;');
  });

  test('targets outside the root are rejected', async () => {
    await makeProj('check.test.ts', STRONG_TEST);
    const result = await runMutationGate(dir, {
      target: '../escape.ts',
      testCommand: 'bun test check.test.ts',
    });
    expect(result.success).toBe(false);
  });

  test('tdd mutate wires the gate with contract exit codes', async () => {
    await makeProj('check.test.ts', STRONG_TEST);
    const pass = await routeCommand(
      parseArgs(['tdd', 'mutate', '--target', 'src/math.ts', '--command', 'bun test check.test.ts', '--output=json']),
      dir,
    );
    expect(pass.code).toBe(0);
    await writeFile(join(dir, 'weak.test.ts'), WEAK_TEST);
    const handsOff = await routeCommand(
      parseArgs(['tdd', 'mutate', '--target', 'src/math.ts', '--command', 'bun test weak.test.ts', '--output=json']),
      dir,
    );
    expect(handsOff.code).toBe(2);
  });
});
