/**
 * harness-v1 task oracles: prompt and testCommand must measure the same thing.
 * Exercises fixtures locally — no model calls.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadHarnessSuite } from '../../src/core/evaluation/harness-experiment';
import { parse } from 'yaml';

const REPO = resolve(import.meta.dir, '../..');
const SUITE = resolve(REPO, 'eval/suites/harness-v1/suite.yml');
const FIXTURE = resolve(REPO, 'eval/suites/harness-v1/fixture');

async function withWorkdir(
  fn: (cwd: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'cc-oracle-'));
  try {
    await cp(FIXTURE, join(dir, 'fixture'), { recursive: true });
    await fn(join(dir, 'fixture'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(cmd: string, cwd: string): { code: number; stdout: string } {
  const r = spawnSync('bash', ['-lc', cmd], {
    cwd,
    encoding: 'utf-8',
    // Same marker the eval runner (suite-run.ts) sets for task commands,
    // so context-aware oracles behave as they do under real evals.
    env: { ...process.env, CODECONDUCTOR_EVAL_RUN: '1' },
  });
  return { code: r.status ?? 1, stdout: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('harness-v1 suite task alignment', () => {
  test('suite loads 5 tasks with aligned testCommands', async () => {
    const suite = await loadHarnessSuite(REPO, 'harness-v1', SUITE);
    expect(suite.success).toBe(true);
    if (!suite.success) return;
    const byId = Object.fromEntries(suite.data.tasks.map((t) => [t.id, t]));
    expect(byId['feature-multiply']!.testCommand).toBe(
      'bun test src/multiply.test.ts',
    );
    expect(byId['feature-multiply']!.prompt.toLowerCase()).toContain('multiply');
    expect(byId['feature-multiply']!.prompt.toLowerCase()).toMatch(
      /do not change add|leave add/,
    );
    expect(byId['review-seeded-bug']!.testCommand).toBe(
      'bun test src/review-report.test.ts',
    );
    expect(byId['review-seeded-bug']!.prompt).toMatch(/review-report\.md/i);
    expect(byId['review-seeded-bug']!.prompt).toMatch(/do NOT modify/i);
    expect(byId['review-seeded-bug']!.acceptanceCriteria.join(' ')).toMatch(
      /unchanged|buggy/i,
    );
  });
});

describe('feature-multiply oracle', () => {
  test('passes when multiply exists even if add is still broken', async () => {
    await withWorkdir(async (cwd) => {
      const math = await readFile(join(cwd, 'src/math.ts'), 'utf-8');
      expect(math).toContain('a + b + 1'); // still broken
      await writeFile(
        join(cwd, 'src/math.ts'),
        `${math}\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n`,
        'utf-8',
      );
      const example = await readFile(
        join(cwd, 'src/multiply.test.ts.example'),
        'utf-8',
      );
      await writeFile(join(cwd, 'src/multiply.test.ts'), example, 'utf-8');
      const r = run('bun test src/multiply.test.ts', cwd);
      expect(r.code).toBe(0);
    });
  });

  test('fails when multiply is missing (add-only fix is not enough)', async () => {
    await withWorkdir(async (cwd) => {
      await writeFile(
        join(cwd, 'src/math.ts'),
        `export function add(a: number, b: number): number {\n  return a + b;\n}\n`,
        'utf-8',
      );
      const example = await readFile(
        join(cwd, 'src/multiply.test.ts.example'),
        'utf-8',
      );
      await writeFile(join(cwd, 'src/multiply.test.ts'), example, 'utf-8');
      const r = run('bun test src/multiply.test.ts', cwd);
      expect(r.code).not.toBe(0);
    });
  });
});

describe('review-seeded-bug oracle', () => {
  test('passes when report names the defect and clamp stays buggy', async () => {
    await withWorkdir(async (cwd) => {
      await writeFile(
        join(cwd, 'src/review-report.md'),
        [
          '# Review',
          '',
          'Defect in clamp(): when n equals max (upper bound), the condition',
          '`n >= max` returns max-1 — an off-by-one. Do not patch in this task.',
          '',
        ].join('\n'),
        'utf-8',
      );
      const r = run('bun test src/review-report.test.ts', cwd);
      expect(r.code).toBe(0);
    });
  });

  test('fails when code is patched but no report is written', async () => {
    await withWorkdir(async (cwd) => {
      await writeFile(
        join(cwd, 'src/review-target.ts'),
        `export function clamp(n: number, min: number, max: number): number {\n  if (n < min) return min;\n  if (n > max) return max;\n  return n;\n}\n`,
        'utf-8',
      );
      // No review-report.md
      const r = run('bun test src/review-report.test.ts', cwd);
      expect(r.code).not.toBe(0);
    });
  });

  test('fails when report is missing even if prompt-shaped text is empty', async () => {
    await withWorkdir(async (cwd) => {
      const r = run('bun test src/review-report.test.ts', cwd);
      expect(r.code).not.toBe(0);
    });
  });
});

describe('shared fixture still supports fix-add oracle', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test('math.test.ts.example still requires add(2,3)===5', async () => {
    await withWorkdir(async (cwd) => {
      dirs.push(resolve(cwd, '..'));
      const example = await readFile(
        join(cwd, 'src/math.test.ts.example'),
        'utf-8',
      );
      await writeFile(join(cwd, 'src/math.test.ts'), example, 'utf-8');
      // Broken add → fail
      expect(run('bun test src/math.test.ts', cwd).code).not.toBe(0);
      await writeFile(
        join(cwd, 'src/math.ts'),
        `export function add(a: number, b: number): number {\n  return a + b;\n}\n`,
        'utf-8',
      );
      expect(run('bun test src/math.test.ts', cwd).code).toBe(0);
    });
  });
});

describe('suite.yml parses without schema drift', () => {
  test('raw yaml has review type and dedicated multiply/review commands', async () => {
    const raw = parse(await readFile(SUITE, 'utf-8')) as {
      tasks: Array<{ id: string; type: string; testCommand: string }>;
    };
    const review = raw.tasks.find((t) => t.id === 'review-seeded-bug');
    const multiply = raw.tasks.find((t) => t.id === 'feature-multiply');
    expect(review?.type).toBe('review');
    expect(review?.testCommand).toContain('review-report');
    expect(multiply?.testCommand).toContain('multiply');
  });
});
