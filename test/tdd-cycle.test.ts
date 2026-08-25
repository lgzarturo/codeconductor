import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createInitialTddState,
  tddCycleStateMachine,
} from '../src/domain/loop/loop-state';
import { advanceTddPhase } from '../src/core/loop/loop-engine';
import {
  captureTddSuiteEvidence,
  loadTddSuiteEvidence,
} from '../src/core/verification/verification-runner';
import { evidenceDir } from '../src/core/product-graph/paths';

const RUNNER = { capturedBy: 'verification-runner' as const };

describe('tddCycleStateMachine', () => {
  test('RED→GREEN requires failing suite evidence from the runner', () => {
    const red = createInitialTddState();
    const blocked = tddCycleStateMachine(red, {
      type: 'SUITE_EVIDENCE',
      evidenceId: 'handmade',
      evidence: { capturedBy: 'agent', suiteFailed: true, suitePassed: false },
    });
    expect(blocked.state.phase).toBe('RED');
    expect(blocked.result).toBe('TERMINATE');

    const passing = tddCycleStateMachine(red, {
      type: 'SUITE_EVIDENCE',
      evidenceId: 'ev-pass',
      evidence: { ...RUNNER, suiteFailed: false, suitePassed: true },
    });
    expect(passing.state.phase).toBe('RED');

    const next = tddCycleStateMachine(red, {
      type: 'SUITE_EVIDENCE',
      evidenceId: 'ev-fail',
      evidence: { ...RUNNER, suiteFailed: true, suitePassed: false },
    });
    expect(next.result).toBe('CONTINUE');
    expect(next.state.phase).toBe('GREEN');
    expect(next.state.evidenceIds).toEqual(['ev-fail']);
  });

  test('GREEN→REFACTOR requires passing suite evidence from the runner', () => {
    const green = tddCycleStateMachine(createInitialTddState(), {
      type: 'SUITE_EVIDENCE',
      evidenceId: 'ev-fail',
      evidence: { ...RUNNER, suiteFailed: true, suitePassed: false },
    }).state;

    const stillFailing = tddCycleStateMachine(green, {
      type: 'SUITE_EVIDENCE',
      evidenceId: 'ev-still-fail',
      evidence: { ...RUNNER, suiteFailed: true, suitePassed: false },
    });
    expect(stillFailing.state.phase).toBe('GREEN');

    const next = tddCycleStateMachine(green, {
      type: 'SUITE_EVIDENCE',
      evidenceId: 'ev-pass',
      evidence: { ...RUNNER, suiteFailed: false, suitePassed: true },
    });
    expect(next.result).toBe('CONTINUE');
    expect(next.state.phase).toBe('REFACTOR');
  });
});

describe('captureTddSuiteEvidence + advanceTddPhase', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cc-tdd-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function writeSuite(name: string, passing: boolean) {
    await writeFile(
      join(projectRoot, name),
      `import { expect, test } from 'bun:test';
test('${name}', () => { expect(1).toBe(${passing ? 1 : 2}); });
`,
    );
  }

  test('runner-captured failing suite advances RED→GREEN; handmade JSON does not', async () => {
    await writeSuite('fail.test.ts', false);
    const captured = await captureTddSuiteEvidence(projectRoot, 'task-tdd', {
      command: 'bun test fail.test.ts',
    });
    expect(captured.success).toBe(true);
    if (!captured.success) return;
    expect(captured.data.suiteFailed).toBe(true);
    expect(captured.data.suitePassed).toBe(false);

    const advanced = await advanceTddPhase(
      projectRoot,
      'task-tdd',
      createInitialTddState(),
      captured.data.evidenceId,
    );
    expect(advanced.success).toBe(true);
    if (!advanced.success) return;
    expect(advanced.data.state.phase).toBe('GREEN');

    const dir = evidenceDir(projectRoot);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'ev-handmade.json'),
      JSON.stringify({
        id: 'ev-handmade',
        source: 'agent',
        type: 'tdd',
        timestamp: new Date().toISOString(),
        relatedTask: 'task-tdd',
        confidence: 1,
        data: {
          capturedBy: 'verification-runner',
          suiteFailed: true,
          suitePassed: false,
        },
      }),
    );
    const handmade = await loadTddSuiteEvidence(projectRoot, 'task-tdd', 'ev-handmade');
    expect(handmade.success).toBe(false);
  });

  test('runner-captured passing suite advances GREEN→REFACTOR', async () => {
    await writeSuite('fail.test.ts', false);
    const red = await captureTddSuiteEvidence(projectRoot, 'task-tdd', {
      command: 'bun test fail.test.ts',
    });
    expect(red.success).toBe(true);
    if (!red.success) return;
    const afterRed = await advanceTddPhase(
      projectRoot,
      'task-tdd',
      createInitialTddState(),
      red.data.evidenceId,
    );
    expect(afterRed.success).toBe(true);
    if (!afterRed.success) return;

    await writeSuite('pass.test.ts', true);
    const green = await captureTddSuiteEvidence(projectRoot, 'task-tdd', {
      command: 'bun test pass.test.ts',
    });
    expect(green.success).toBe(true);
    if (!green.success) return;
    expect(green.data.suitePassed).toBe(true);

    const afterGreen = await advanceTddPhase(
      projectRoot,
      'task-tdd',
      afterRed.data.state,
      green.data.evidenceId,
    );
    expect(afterGreen.success).toBe(true);
    if (!afterGreen.success) return;
    expect(afterGreen.data.state.phase).toBe('REFACTOR');
  });
});
