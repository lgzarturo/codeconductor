import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
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
});
