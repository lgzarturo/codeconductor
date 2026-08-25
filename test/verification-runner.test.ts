/**
 * Tests for fail-closed verification and completion gating.
 *
 * `runVerification` and `gateTaskCompletion` guard task completion. Both must
 * fail closed: when configuration, the compile command, or evidence cannot be
 * read and trusted, verification must not report success.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gateTaskCompletion, runVerification } from '../src/core/verification/verification-runner';
import { evidenceDir } from '../src/core/product-graph/paths';
import type { EvidenceInput, GoalGraphInput } from '../src/validation/schemas';
import type { Result } from '../src/utils/result';

const BASE_CONFIG = `version: "0.5.0"
project:
  name: verify-test
defaults:
  target: cursor
  overwrite: false
presets:
  council:
    enabled: true
    version: "0.5.0"
safety:
  destructiveCommands: []
  secretPatterns: []
`;

function configWithCompileCheck(command: string, timeoutMs = 30_000): string {
  return `${BASE_CONFIG}  compileCheck:
    enabled: true
    command: ${JSON.stringify(command)}
    timeoutMs: ${timeoutMs}
`;
}

let projectRoot: string;

async function writeConfig(content: string) {
  await mkdir(join(projectRoot, '.codeconductor'), { recursive: true });
  await writeFile(join(projectRoot, '.codeconductor', 'config.yml'), content, 'utf-8');
}

function makeGoal(overrides: Partial<GoalGraphInput['tasks'][0]> = {}): GoalGraphInput {
  return {
    objective: 'fail-closed verification',
    created_at: new Date().toISOString(),
    tasks: [
      {
        id: 'task-1',
        title: 'Task one',
        type: 'feature',
        risk: 'low',
        status: 'in-progress',
        depends_on: [],
        acceptance_criteria: ['it works'],
        context_scope: 'isolated',
        ...overrides,
      },
    ],
  };
}

async function writeEvidence(evidence: EvidenceInput) {
  const dir = evidenceDir(projectRoot);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${evidence.id}.json`), JSON.stringify(evidence, null, 2), 'utf-8');
}

function evidence(overrides: Partial<EvidenceInput> & { id: string; type: string }): EvidenceInput {
  return {
    source: 'test',
    timestamp: new Date().toISOString(),
    relatedTask: 'task-1',
    confidence: 0.9,
    ...overrides,
  };
}

/** A fail-closed result is either an error or an explicit `passed: false`. */
function expectFailClosed(result: Result<{ passed: boolean }, Error>) {
  expect(result.success && result.data.passed).toBe(false);
}

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'cc-verify-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('runVerification: fail-closed', () => {
  test('fails closed when config cannot be loaded', async () => {
    const result = await runVerification(projectRoot, 'task-1', makeGoal());
    expectFailClosed(result);
  });

  test('returns an error when the task is not in the goal', async () => {
    await writeConfig(BASE_CONFIG);
    const result = await runVerification(projectRoot, 'missing-task', makeGoal());
    expect(result.success).toBe(false);
  });

  test('returns an error when the goal cannot be loaded', async () => {
    await writeConfig(BASE_CONFIG);
    const result = await runVerification(projectRoot, 'task-1');
    expect(result.success).toBe(false);
  });

  test('allowlisted compile commands run without --allow-compile-check', async () => {
    await writeConfig(configWithCompileCheck('bun run --silent cc-no-such-script-xyz'));

    const result = await runVerification(projectRoot, 'task-1', makeGoal());

    expect(result.success).toBe(true);
    if (!result.success) return;
    const check = result.data.checks.find((c) => c.name === 'compile_check');
    expect(check?.message).not.toContain('--allow-compile-check');
    expect(check?.message).toMatch(/Compile check (passed|failed)/);
  });

  test('does not execute the repo-configured compile command without explicit opt-in', async () => {
    await writeConfig(
      configWithCompileCheck(`node -e "require('fs').writeFileSync('compile-ran.txt','1')"`),
    );

    const result = await runVerification(projectRoot, 'task-1', makeGoal());

    expect(existsSync(join(projectRoot, 'compile-ran.txt'))).toBe(false);
    expectFailClosed(result);
    if (result.success) {
      const check = result.data.checks.find((c) => c.name === 'compile_check');
      expect(check?.message).toContain('--allow-compile-check');
    }
  });

  test('actually executes the configured compile command with opt-in', async () => {
    await writeConfig(
      configWithCompileCheck(`node -e "require('fs').writeFileSync('compile-ran.txt','1')"`),
    );

    const result = await runVerification(projectRoot, 'task-1', makeGoal(), {
      allowCompileCheck: true,
    });
    expect(existsSync(join(projectRoot, 'compile-ran.txt'))).toBe(true);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.passed).toBe(true);
  });

  test('the compile child process does not inherit secrets from process.env', async () => {
    process.env.CC_TEST_SECRET_LEAK = 'top-secret';
    process.env.OPENAI_API_KEY = 'sk-test-must-not-leak';
    try {
      await writeConfig(
        configWithCompileCheck(
          `node -e "require('fs').writeFileSync('child-env.json', JSON.stringify({ keys: Object.keys(process.env), path: process.env.PATH }))"`,
        ),
      );

      await runVerification(projectRoot, 'task-1', makeGoal(), { allowCompileCheck: true });

      const childEnv = JSON.parse(
        await readFile(join(projectRoot, 'child-env.json'), 'utf-8'),
      ) as { keys: string[]; path?: string };
      expect(childEnv.keys).not.toContain('CC_TEST_SECRET_LEAK');
      expect(childEnv.keys).not.toContain('OPENAI_API_KEY');
      expect(childEnv.keys).toContain('PATH');
      expect(typeof childEnv.path).toBe('string');
      expect(childEnv.path!.length).toBeGreaterThan(0);
    } finally {
      delete process.env.CC_TEST_SECRET_LEAK;
      delete process.env.OPENAI_API_KEY;
    }
  });

  test('fails closed when the compile command exits non-zero', async () => {
    await writeConfig(configWithCompileCheck('node -e "process.exit(1)"'));

    const result = await runVerification(projectRoot, 'task-1', makeGoal(), {
      allowCompileCheck: true,
    });
    expectFailClosed(result);
  });

  test('fails closed when the compile command times out', async () => {
    await writeConfig(configWithCompileCheck('node -e "setTimeout(() => {}, 3000)"', 100));

    const startedAt = performance.now();
    const result = await runVerification(projectRoot, 'task-1', makeGoal(), {
      allowCompileCheck: true,
    });
    const elapsedMs = performance.now() - startedAt;

    expectFailClosed(result);
    expect(elapsedMs).toBeLessThan(1500);
  }, 5000);

  test('fails closed when the compile command cannot be spawned', async () => {
    await writeConfig(configWithCompileCheck('cc-nonexistent-binary-xyz --check'));

    const result = await runVerification(projectRoot, 'task-1', makeGoal(), {
      allowCompileCheck: true,
    });
    expectFailClosed(result);
  });

  test('fails closed when compile check is enabled without a command', async () => {
    await writeConfig(`${BASE_CONFIG}  compileCheck:\n    enabled: true\n`);

    const result = await runVerification(projectRoot, 'task-1', makeGoal());
    expectFailClosed(result);
  });

  test('fails closed when an evidence file is not valid JSON', async () => {
    await writeConfig(BASE_CONFIG);
    await mkdir(evidenceDir(projectRoot), { recursive: true });
    await writeFile(join(evidenceDir(projectRoot), 'broken.json'), '{ not json', 'utf-8');

    const result = await runVerification(projectRoot, 'task-1', makeGoal());
    expectFailClosed(result);
  });

  test('fails closed when an evidence file violates EvidenceSchema', async () => {
    await writeConfig(BASE_CONFIG);
    await mkdir(evidenceDir(projectRoot), { recursive: true });
    await writeFile(
      join(evidenceDir(projectRoot), 'bad-shape.json'),
      JSON.stringify({ id: 'ev-x', confidence: 42 }),
      'utf-8',
    );

    const result = await runVerification(projectRoot, 'task-1', makeGoal());
    expectFailClosed(result);
  });

  test('written verification evidence records passed and checks', async () => {
    await writeConfig(BASE_CONFIG);

    const result = await runVerification(projectRoot, 'task-1', makeGoal());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const files = await readdir(evidenceDir(projectRoot));
    const verifyFile = files.find((f) => f.startsWith('ev-verify-'));
    expect(verifyFile).toBeDefined();

    const raw = JSON.parse(await readFile(join(evidenceDir(projectRoot), verifyFile!), 'utf-8'));
    expect(raw.type).toBe('verification');
    expect(raw.data.passed).toBe(result.data.passed);
    expect(Array.isArray(raw.data.checks)).toBe(true);
    expect(raw.data.checks.length).toBeGreaterThan(0);
  });

  test('a high risk task without evidence does not pass', async () => {
    await writeConfig(BASE_CONFIG);

    const result = await runVerification(projectRoot, 'task-1', makeGoal({ risk: 'high' }));
    expectFailClosed(result);
  });

  test('a failed verification cannot make a repeated high risk verification pass', async () => {
    await writeConfig(BASE_CONFIG);
    const goal = makeGoal({ risk: 'high' });

    const first = await runVerification(projectRoot, 'task-1', goal);
    expectFailClosed(first);

    const second = await runVerification(projectRoot, 'task-1', goal);
    expectFailClosed(second);
  });
});

describe('gateTaskCompletion: fail-closed', () => {
  beforeEach(async () => {
    await writeConfig(BASE_CONFIG);
  });

  test('acceptance criteria require passed verification evidence', async () => {
    const result = await gateTaskCompletion(projectRoot, 'task-1', ['acceptance_criteria_met']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(false);
  });

  test('acceptance criteria are not met by failed verification evidence', async () => {
    await writeEvidence(
      evidence({ id: 'ev-1', type: 'verification', data: { passed: false, checks: [] } }),
    );

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['acceptance_criteria_met']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(false);
  });

  test('acceptance criteria are met by passed verification evidence', async () => {
    await writeEvidence(
      evidence({ id: 'ev-1', type: 'verification', data: { passed: true, checks: [] } }),
    );

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['acceptance_criteria_met']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(true);
  });

  test('verification evidence for another task does not satisfy the gate', async () => {
    await writeEvidence(
      evidence({
        id: 'ev-1',
        type: 'verification',
        relatedTask: 'other-task',
        data: { passed: true, checks: [] },
      }),
    );

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['acceptance_criteria_met']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(false);
  });

  test('tests_passed is not satisfied by verification evidence alone', async () => {
    await writeEvidence(
      evidence({ id: 'ev-1', type: 'verification', data: { passed: true, checks: [] } }),
    );

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['tests_passed']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(false);
  });

  test('tests_passed is not satisfied by arbitrary test data with passed true', async () => {
    await writeEvidence(
      evidence({ id: 'ev-forged-test', type: 'test', data: { passed: true, arbitrary: 'value' } }),
    );

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['tests_passed']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(false);
  });

  test('tests_passed accepts the test result shape used by ImplementerOutputSchema', async () => {
    await writeEvidence(
      evidence({
        id: 'ev-1',
        type: 'test',
        data: { runner: 'bun test', result: 'failed', failedTests: ['one regression'] },
      }),
    );

    const failing = await gateTaskCompletion(projectRoot, 'task-1', ['tests_passed']);
    expect(failing.success).toBe(true);
    if (!failing.success) return;
    expect(failing.data).toBe(false);

    await writeEvidence(
      evidence({
        id: 'ev-2',
        type: 'test',
        data: { runner: 'bun test', result: 'passed', failedTests: [] },
      }),
    );

    const passing = await gateTaskCompletion(projectRoot, 'task-1', ['tests_passed']);
    expect(passing.success).toBe(true);
    if (!passing.success) return;
    expect(passing.data).toBe(true);
  });

  test('review_approved accepts the ReviewerOutputSchema contract', async () => {
    await writeEvidence(
      evidence({
        id: 'ev-1',
        type: 'review',
        data: {
          status: 'fail',
          confidence: 0.9,
          verdict: 'blocked',
          warnings: [],
          findings: [],
          artifacts: [],
          next_actions: [],
        },
      }),
    );

    const rejected = await gateTaskCompletion(projectRoot, 'task-1', ['review_approved']);
    expect(rejected.success).toBe(true);
    if (!rejected.success) return;
    expect(rejected.data).toBe(false);

    await writeEvidence(
      evidence({
        id: 'ev-2',
        type: 'review',
        data: {
          status: 'pass',
          confidence: 0.9,
          verdict: 'approved',
          warnings: [],
          findings: [],
          artifacts: [],
          next_actions: [],
        },
      }),
    );

    const approved = await gateTaskCompletion(projectRoot, 'task-1', ['review_approved']);
    expect(approved.success).toBe(true);
    if (!approved.success) return;
    expect(approved.data).toBe(true);
  });

  test('review_approved is not satisfied by arbitrary review data with passed true', async () => {
    await writeEvidence(
      evidence({
        id: 'ev-forged-review',
        type: 'review',
        data: { passed: true, verdict: 'blocked' },
      }),
    );

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['review_approved']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(false);
  });

  test('an unknown requirement blocks completion', async () => {
    await writeEvidence(
      evidence({ id: 'ev-1', type: 'verification', data: { passed: true, checks: [] } }),
    );

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['vibes_checked']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(false);
  });

  test('an unreadable evidence file blocks completion', async () => {
    await writeEvidence(
      evidence({ id: 'ev-1', type: 'verification', data: { passed: true, checks: [] } }),
    );
    await writeFile(join(evidenceDir(projectRoot), 'broken.json'), '{ not json', 'utf-8');

    const result = await gateTaskCompletion(projectRoot, 'task-1', ['acceptance_criteria_met']);
    expect(result.success && result.data).toBe(false);
  });

  test('no requirements means nothing to gate', async () => {
    const result = await gateTaskCompletion(projectRoot, 'task-1', []);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(true);
  });
});

describe('runVerification: path safety', () => {
  test('cc01 review: traversal taskId never writes outside evidenceDir', async () => {
    await writeConfig(BASE_CONFIG);
    const maliciousId = '../../../cc01-escaped';
    const goal = makeGoal({ id: maliciousId });
    const sentinelPath = join(projectRoot, '.codeconductor', 'SENTINEL');
    await writeFile(sentinelPath, 'untouched', 'utf-8');
    const evRoot = evidenceDir(projectRoot);

    await runVerification(projectRoot, maliciousId, goal);

    expect(await readFile(sentinelPath, 'utf-8')).toBe('untouched');

    const ccEntries = await readdir(join(projectRoot, '.codeconductor'));
    expect(ccEntries.filter((name) => name.includes('cc01-escaped'))).toEqual([]);
    expect(ccEntries.filter((name) => name.startsWith('ev-verify-'))).toEqual([]);

    if (existsSync(evRoot)) {
      for (const name of await readdir(evRoot)) {
        expect(name.includes('..')).toBe(false);
        expect(name.includes('/') || name.includes('\\')).toBe(false);
      }
    }
  });
});
