import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runHarnessSuiteTasks } from '../../src/core/evaluation/suite-run';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');

describe('scorecard suite-run', () => {
  test('hook-guardrails all pass and write outcomes', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cc-eval-'));
    try {
      const result = await runHarnessSuiteTasks(
        tmp,
        'hook-guardrails',
        join(PROJECT_ROOT, 'eval/suites/hook-guardrails/suite.yml')
      );
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(3);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('task commands run with CODECONDUCTOR_EVAL_RUN=1', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cc-eval-env-'));
    try {
      const suitePath = join(tmp, 'suite.yml');
      await writeFile(
        suitePath,
        [
          'id: env-probe',
          'version: 1',
          'tasks:',
          '  - id: env-is-set',
          '    title: Eval env marker is set',
          "    type: fix",
          '    risk: low',
          '    prompt: Probe.',
          '    scope: none',
          '    acceptanceCriteria:',
          '      - env marker equals 1',
          `    testCommand: bun -e "if (process.env.CODECONDUCTOR_EVAL_RUN !== '1') process.exit(1)"`,
          '',
        ].join('\n'),
      );
      const result = await runHarnessSuiteTasks(tmp, 'env-probe', suitePath);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
