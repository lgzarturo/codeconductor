import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessStateMachine } from '../../../../src/core/verification/harness/state-machine';
import {
  GatekeeperError,
  SealViolationError,
  SymbolCollisionError,
  type ArbiterVerdict,
  type ChallengeCertificate,
  type HarnessRunner,
  type TaskContext,
} from '../../../../src/core/verification/harness/types';
import { freezeTestSuite } from '../../../../src/core/verification/test-freeze';
import { buildSymbolMap } from '../../../../src/core/verification/harness/symbol-map';

const TEST_SRC = (n: number) =>
  `import { expect, test } from 'bun:test';\ntest('t', () => {\n${Array.from({ length: n }, (_, i) => `  expect(${i}).toBe(${i});`).join('\n')}\n});\n`;

const CERT: ChallengeCertificate = {
  testFile: 'tests/a.test.ts',
  testName: 't',
  specReference: 'AC1',
  sealedAssertion: 'expect(1).toBe(1)',
  executionEvidence: 'received 2',
};

let root: string;
let ctx: TaskContext;
let calls: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-sm-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'tests'), { recursive: true });
  await writeFile(join(root, 'bunfig.toml'), '[test]\n');
  await writeFile(join(root, 'TASK_CARD.md'), '# card\n');
  ctx = {
    taskCardPath: join(root, 'TASK_CARD.md'),
    worktreeRoot: root,
    testFiles: ['tests/a.test.ts'],
    protectedConfigs: ['bunfig.toml'],
    domainGlobs: ['src/core/**'],
  };
  calls = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Script {
  stubs?: string;
  tests?: number;
  red?: boolean;
  steps?: Array<{ passed: boolean; challenge?: ChallengeCertificate | null; mutate?: () => Promise<void>; modified?: string[] }>;
  verdicts?: ArbiterVerdict[];
  fixTests?: number;
  mutation?: boolean[];
}

function fakeRunner(script: Script): HarnessRunner & { arbiterArgs: unknown[][]; authorFixes: Array<string | null> } {
  const steps = [...(script.steps ?? [{ passed: true }])];
  const verdicts = [...(script.verdicts ?? [])];
  const mutation = [...(script.mutation ?? [true])];
  const arbiterArgs: unknown[][] = [];
  const authorFixes: Array<string | null> = [];
  let authored = 0;
  return {
    arbiterArgs,
    authorFixes,
    async generateStubs() {
      calls.push('stubs');
      await writeFile(join(root, 'src/stub.ts'), script.stubs ?? 'export class Stub {}\n');
      return ['src/stub.ts'];
    },
    async authorTests(_ctx, fix) {
      calls.push('author');
      authorFixes.push(fix);
      const n = authored++ === 0 ? (script.tests ?? 2) : (script.fixTests ?? script.tests ?? 2);
      await writeFile(join(root, 'tests/a.test.ts'), TEST_SRC(n));
    },
    async verifyRedPhase() {
      calls.push('red');
      return script.red ?? true;
    },
    async runImplementerStep() {
      calls.push('impl');
      const step = steps.shift() ?? { passed: true };
      await step.mutate?.();
      return { passed: step.passed, modified: step.modified ?? ['src/stub.ts'], challenge: step.challenge ?? null };
    },
    async invokeBlindArbiter(cert, taskCardPath) {
      calls.push('arbiter');
      arbiterArgs.push([cert, taskCardPath]);
      return verdicts.shift() ?? { verdict: 'REJECT_CHALLENGE', reasoning: 'no', authorFixInstruction: null };
    },
    async runDiffMutation() {
      calls.push('mutation');
      return mutation.shift() ?? true;
    },
  };
}

describe('HarnessStateMachine — happy path and gates', () => {
  test('runs stubs → tests → red → implementation → mutation and completes', async () => {
    const state = await new HarnessStateMachine(ctx, fakeRunner({})).execute();
    expect(state).toBe('COMPLETED');
    expect(calls).toEqual(['stubs', 'author', 'red', 'impl', 'mutation']);
  });

  test('surviving mutants send the work back to the implementer', async () => {
    const state = await new HarnessStateMachine(
      ctx,
      fakeRunner({ steps: [{ passed: true }, { passed: true }], mutation: [false, true] }),
    ).execute();
    expect(state).toBe('COMPLETED');
    expect(calls.filter((c) => c === 'impl')).toHaveLength(2);
    expect(calls.at(-1)).toBe('mutation');
  });

  test('aborts when the RED phase is not clean', async () => {
    expect(await new HarnessStateMachine(ctx, fakeRunner({ red: false })).execute()).toBe('ABORTED');
    expect(calls).not.toContain('impl');
  });

  test('aborts after max implementer retries', async () => {
    const runner = fakeRunner({ steps: Array.from({ length: 10 }, () => ({ passed: false })) });
    expect(await new HarnessStateMachine({ ...ctx, maxImplementerRetries: 3 }, runner).execute()).toBe('ABORTED');
    expect(calls.filter((c) => c === 'impl')).toHaveLength(3);
  });
});

describe('HarnessStateMachine — seal enforcement', () => {
  test('throws SealViolationError when the implementer edits a sealed test', async () => {
    const tamper = async () => writeFile(join(root, 'tests/a.test.ts'), TEST_SRC(1));
    const runner = fakeRunner({ steps: [{ passed: true, mutate: tamper }] });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(SealViolationError);
  });

  test('throws SealViolationError when the implementer edits a protected config', async () => {
    const tamper = async () => writeFile(join(root, 'bunfig.toml'), '[test]\npreload=["x"]\n');
    const runner = fakeRunner({ steps: [{ passed: true, mutate: tamper }] });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(SealViolationError);
  });

  test('rejects a test suite with zero assertions', async () => {
    await expect(new HarnessStateMachine(ctx, fakeRunner({ tests: 0 })).execute()).rejects.toBeInstanceOf(
      SealViolationError,
    );
  });
});

describe('HarnessStateMachine — blind arbitration', () => {
  const challengeSteps = [
    { passed: false },
    { passed: false },
    { passed: false, challenge: CERT },
  ];

  test('ignores a challenge raised before the minimum number of attempts', async () => {
    const runner = fakeRunner({ steps: [{ passed: false, challenge: CERT }, { passed: true }] });
    expect(await new HarnessStateMachine(ctx, runner).execute()).toBe('COMPLETED');
    expect(calls).not.toContain('arbiter');
  });

  test('gives the arbiter only the certificate and the task card path', async () => {
    const runner = fakeRunner({
      steps: [...challengeSteps, { passed: true }],
      verdicts: [{ verdict: 'REJECT_CHALLENGE', reasoning: 'ok', authorFixInstruction: null }],
    });
    await new HarnessStateMachine(ctx, runner).execute();
    expect(runner.arbiterArgs).toEqual([[CERT, ctx.taskCardPath]]);
  });

  test('SPEC_AMBIGUITY blocks the workflow', async () => {
    const runner = fakeRunner({
      steps: challengeSteps,
      verdicts: [{ verdict: 'SPEC_AMBIGUITY', reasoning: 'vague', authorFixInstruction: null }],
    });
    expect(await new HarnessStateMachine(ctx, runner).execute()).toBe('BLOCKED_SPEC');
  });

  test('aborts when challenges exceed the allowed budget', async () => {
    const steps = Array.from({ length: 12 }, () => ({ passed: false, challenge: CERT }));
    const runner = fakeRunner({ steps });
    const sm = new HarnessStateMachine({ ...ctx, maxChallengesAllowed: 1, maxImplementerRetries: 10 }, runner);
    expect(await sm.execute()).toBe('ABORTED');
    expect(runner.arbiterArgs).toHaveLength(1);
  });

  test('UPHOLD_TEST_BUG reopens authoring with the fix, re-seals without a second RED, and resets attempts', async () => {
    const runner = fakeRunner({
      tests: 2,
      fixTests: 2,
      steps: [...challengeSteps, { passed: true }],
      verdicts: [{ verdict: 'UPHOLD_TEST_BUG', reasoning: 'bad', authorFixInstruction: 'fix assert 2' }],
    });
    const state = await new HarnessStateMachine({ ...ctx, maxImplementerRetries: 4 }, runner).execute();
    expect(state).toBe('COMPLETED');
    expect(runner.authorFixes).toEqual([null, 'fix assert 2']);
    expect(calls.filter((c) => c === 'red')).toHaveLength(1);
  });

  test('UPHOLD_TEST_BUG fix that removes assertions is rejected', async () => {
    const runner = fakeRunner({
      tests: 3,
      fixTests: 2,
      steps: challengeSteps,
      verdicts: [{ verdict: 'UPHOLD_TEST_BUG', reasoning: 'bad', authorFixInstruction: 'fix' }],
    });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(SealViolationError);
  });
});

describe('HarnessStateMachine — static gatekeepers', () => {
  test('rejects stubs that violate the parameter limit', async () => {
    const stubs = 'export function f(a: 1, b: 1, c: 1, d: 1, e: 1) { throw new Error("Stub"); }\n';
    await expect(new HarnessStateMachine(ctx, fakeRunner({ stubs })).execute()).rejects.toBeInstanceOf(
      GatekeeperError,
    );
  });

  test('rejects stubs duplicating a symbol already in SYMBOL_MAP.json', async () => {
    await writeFile(join(root, 'src/existing.ts'), 'export class Stub {}\n');
    await buildSymbolMap(root, join(root, 'SYMBOL_MAP.json'));
    await expect(new HarnessStateMachine(ctx, fakeRunner({})).execute()).rejects.toBeInstanceOf(
      SymbolCollisionError,
    );
  });

  test('rejects tests that mock a domain module', async () => {
    const runner = fakeRunner({});
    const original = runner.authorTests;
    runner.authorTests = async (c, fix) => {
      await original(c, fix);
      await writeFile(
        join(root, 'tests/a.test.ts'),
        `import { mock } from 'bun:test';\nmock.module('../src/core/x', () => ({}));\n${TEST_SRC(2)}`,
      );
    };
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(GatekeeperError);
  });
});

describe('HarnessStateMachine — seal hardening', () => {
  test('an implementer that edits a test and re-seals the lock with fresh hashes is still caught', async () => {
    const forge = async () => {
      await writeFile(join(root, 'tests/a.test.ts'), TEST_SRC(1));
      await freezeTestSuite(['tests/a.test.ts', 'bunfig.toml'], join(root, '.harness'), root);
    };
    const runner = fakeRunner({ steps: [{ passed: true, mutate: forge }] });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(SealViolationError);
  });

  test('package.json is sealed by default when present', async () => {
    await writeFile(join(root, 'package.json'), '{"scripts":{"test":"bun test"}}');
    const tamper = async () => writeFile(join(root, 'package.json'), '{"scripts":{"test":"true"}}');
    const runner = fakeRunner({ steps: [{ passed: true, mutate: tamper }] });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(SealViolationError);
  });

  test('a sealed path that does not exist fails instead of sealing nothing', async () => {
    const bad = { ...ctx, protectedConfigs: ['typo.toml'] };
    await expect(new HarnessStateMachine(bad, fakeRunner({})).execute()).rejects.toBeInstanceOf(SealViolationError);
  });

  test('context paths escaping the worktree are rejected', async () => {
    const bad = { ...ctx, testFiles: ['../outside.test.ts'] };
    await expect(new HarnessStateMachine(bad, fakeRunner({})).execute()).rejects.toThrow(/escapes/i);
  });

  test('a production file the runner did not report is still gated (changed set comes from git)', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const sneaky = async () =>
      writeFile(join(root, 'src/extra.ts'), 'export function f(a: 1, b: 1, c: 1, d: 1, e: 1) { return a; }\n');
    const runner = fakeRunner({ steps: [{ passed: true, mutate: sneaky }] });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(GatekeeperError);
  });

  test('green tests go to the mutation gate even if the runner also reports a challenge', async () => {
    const runner = fakeRunner({ steps: [{ passed: true, challenge: CERT }] });
    expect(await new HarnessStateMachine(ctx, runner).execute()).toBe('COMPLETED');
    expect(runner.arbiterArgs).toEqual([]);
  });

  const OVER = 'export function f(a: 1, b: 1, c: 1, d: 1, e: 1) { return a; }\n';

  test('a violating file whose name has spaces or non-ASCII characters is still gated', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    for (const name of ['my file.ts', 'é.ts']) {
      const sneaky = async () => writeFile(join(root, 'src', name), OVER);
      const runner = fakeRunner({ steps: [{ passed: true, mutate: sneaky }] });
      await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(GatekeeperError);
      await rm(join(root, '.harness'), { recursive: true, force: true });
      await unlink(join(root, 'src', name));
    }
  });

  test('renames and deletions of production files do not crash the gate', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    await writeFile(join(root, 'src/old.ts'), 'export const a = 1;\n');
    await writeFile(join(root, 'src/gone.ts'), 'export const b = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], { cwd: root });
    const churn = async () => {
      execFileSync('git', ['mv', 'src/old.ts', 'src/new.ts'], { cwd: root });
      await unlink(join(root, 'src/gone.ts'));
    };
    const runner = fakeRunner({ steps: [{ passed: true, mutate: churn }] });
    expect(await new HarnessStateMachine(ctx, runner).execute()).toBe('COMPLETED');
  });

  test('a lock file that is a symlink is never written through', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'harness-lock-outside-'));
    try {
      const victim = join(outside, 'victim.txt');
      await writeFile(victim, 'keep');
      await mkdir(join(root, '.harness'), { recursive: true });
      await symlink(victim, join(root, '.harness/test-freeze.lock'));
      await expect(new HarnessStateMachine(ctx, fakeRunner({})).execute()).rejects.toThrow();
      expect(await readFile(victim, 'utf-8')).toBe('keep');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test('sealed files edited during the mutation gate are caught before COMPLETED', async () => {
    const runner = fakeRunner({});
    runner.runDiffMutation = async () => {
      await writeFile(join(root, 'tests/a.test.ts'), TEST_SRC(1));
      return true;
    };
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(SealViolationError);
  });

  test('if git is present but fails, the gate fails closed instead of trusting the runner', async () => {
    await mkdir(join(root, '.git'));
    const runner = fakeRunner({ steps: [{ passed: true }] });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toThrow(/git/i);
  });

  test('an unsealed test-named file is gated like production code', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const sneaky = async () => writeFile(join(root, 'src/core.test.ts'), OVER);
    const runner = fakeRunner({ steps: [{ passed: true, mutate: sneaky }] });
    await expect(new HarnessStateMachine(ctx, runner).execute()).rejects.toBeInstanceOf(GatekeeperError);
  });

  test('the same file spelled differently by the runner and git is reported once', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const bad = async () => writeFile(join(root, 'src/dup.ts'), OVER);
    const runner = fakeRunner({ steps: [{ passed: true, mutate: bad, modified: ['./src/dup.ts', 'src/dup.ts'] }] });
    const error = await new HarnessStateMachine(ctx, runner).execute().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatekeeperError);
    expect((error as GatekeeperError).violations).toHaveLength(1);
  });

  test('dangling symlinks and declaration files do not crash or false-positive the gate', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const odd = async () => {
      await symlink(join(root, 'missing.ts'), join(root, 'src/dangling.ts'));
      await writeFile(join(root, 'src/types.d.ts'), 'export declare function f(a: 1, b: 1, c: 1, d: 1, e: 1): void;\n');
    };
    const runner = fakeRunner({ steps: [{ passed: true, mutate: odd }] });
    expect(await new HarnessStateMachine(ctx, runner).execute()).toBe('COMPLETED');
  });
});
