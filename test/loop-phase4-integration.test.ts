/**
 * Phase 4 integration test: DDD→SDD→TDD pipeline — loop halts at 3rd failed iteration.
 *
 * Mocks an implementer that always returns syntax errors. Verifies:
 * 1. Loop runs 3 iterations then ESCALATED
 * 2. markTaskBlocked() is called → status === 'blocked'
 * 3. Escalation report file is written to disk
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runLoop, type EscalationReport } from '../src/core/loop/loop-controller';
import { writeEscalationReport } from '../src/core/loop/escalation-emitter';
import { writeGoal, loadGoal, markTaskBlocked } from '../src/core/goal/goal-state';
import { planGoal } from '../src/core/goal/goal-planner';
import type { CompileResult } from '../src/core/compilation/compile-checker';
import type { GoalGraphInput } from '../src/validation/schemas';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const GOAL_DIR = join(PROJECT_ROOT, '.codeconductor');

async function cleanup() {
  try {
    await rm(GOAL_DIR, { recursive: true, force: true });
  } catch {}
}

/**
 * Mock implementer: returns different errors each iteration to avoid
 * the stuck-loop early-escalation (identical errors in 2 consecutive
 * iterations triggers escalation at iteration 2, not 3).
 */
function makeFailingCompileCheck(
  iteration: number,
): CompileResult {
  const errorFile = `src/file${iteration}.ts`;
  const errorCode = `TS1${String(iteration).padStart(3, '0')}`;
  const errorMessage = `Error on iteration ${iteration}`;
  return {
    success: false,
    exitCode: 1,
    stdout: '',
    stderr: `${errorFile}: error ${errorCode}: ${errorMessage}`,
    errors: [
      {
        file: errorFile,
        line: iteration,
        column: iteration,
        code: errorCode,
        message: errorMessage,
        raw: `${errorFile}(${iteration},${iteration}): error ${errorCode}: ${errorMessage}`,
      },
    ],
    durationMs: 10,
    timedOut: false,
  };
}

describe('Phase 4: loop halts at 3rd failed iteration', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('mocked implementer → loop halts at attempt 3 → ESCALATED', async () => {
    let generateCalls = 0;
    const generateFn = async () => {
      generateCalls++;
    };

    const compileCheckFn = async (): Promise<CompileResult> => {
      return makeFailingCompileCheck(generateCalls);
    };

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 3,
    }, 'phase4-test-task');

    // Loop should have attempted exactly 3 iterations
    expect(result.iterations).toBe(3);
    expect(result.success).toBe(false);
    expect(result.finalPhase).toBe('ESCALATED');
    expect(result.totalErrors).toBe(3);

    // Generate was called once per iteration
    expect(generateCalls).toBe(3);

    // Escalation report should be present
    expect(result.escalationReport).toBeDefined();
    expect(result.escalationReport!.iterationsAttempted).toBe(3);
    expect(result.escalationReport!.taskTitle).toBe('phase4-test-task');
    expect(result.escalationReport!.errorHistory).toHaveLength(3);
  });

  test('markTaskBlocked sets task status to blocked', async () => {
    // Set up a goal graph
    const graph = planGoal('Build a user authentication API');
    const writeResult = await writeGoal(PROJECT_ROOT, graph);
    expect(writeResult.success).toBe(true);

    const firstTaskId = graph.tasks[0]!.id;

    // Mark it blocked
    const blockResult = await markTaskBlocked(PROJECT_ROOT, firstTaskId, '3 failed iterations');
    expect(blockResult.success).toBe(true);

    // Reload and verify
    const loadResult = await loadGoal(PROJECT_ROOT);
    expect(loadResult.success).toBe(true);
    if (!loadResult.success) return;

    const blockedTask = loadResult.data.tasks.find((t) => t.id === firstTaskId);
    expect(blockedTask).toBeDefined();
    expect(blockedTask!.status).toBe('blocked');

    // Other tasks should remain unchanged
    for (let i = 1; i < loadResult.data.tasks.length; i++) {
      expect(loadResult.data.tasks[i]!.status).toBe('pending');
    }
  });

  test('markTaskBlocked returns error for unknown task ID', async () => {
    const graph = planGoal('Build a user authentication API');
    await writeGoal(PROJECT_ROOT, graph);

    const result = await markTaskBlocked(PROJECT_ROOT, 'nonexistent-task', 'reason');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('nonexistent-task');
    expect(result.error.message).toContain('not found');
  });

  test('writeEscalationReport creates JSON file on disk', async () => {
    await mkdir(GOAL_DIR, { recursive: true });

    const report: EscalationReport = {
      taskTitle: 'test-task',
      iterationsAttempted: 3,
      errorHistory: [
        [{ file: 'src/a.ts', line: 1, code: 'TS1005', message: "err1", raw: 'err1' }],
        [{ file: 'src/b.ts', line: 2, code: 'TS2001', message: "err2", raw: 'err2' }],
        [{ file: 'src/c.ts', line: 3, code: 'TS3001', message: "err3", raw: 'err3' }],
      ],
      attemptedFixes: [
        'Iteration 1: 1 error(s) — TS1005: err1',
        'Iteration 2: 1 error(s) — TS2001: err2',
        'Iteration 3: 1 error(s) — TS3001: err3',
      ],
      originalContext: 'Original task description',
      recommendedAction: 'Manual intervention required.',
    };

    await writeEscalationReport(PROJECT_ROOT, 'task-abc', report);

    const filePath = join(GOAL_DIR, 'escalated-task-abc.json');
    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.taskTitle).toBe('test-task');
    expect(parsed.iterationsAttempted).toBe(3);
    expect(parsed.errorHistory).toHaveLength(3);
    expect(parsed.recommendedAction).toBe('Manual intervention required.');
  });

  test('full pipeline: loop escalation → markBlocked → report on disk', async () => {
    // 1. Set up goal graph
    const graph = planGoal('Build payment processing module');
    await writeGoal(PROJECT_ROOT, graph);
    const taskId = graph.tasks[0]!.id;

    // 2. Run the loop — implementer always fails with varying errors
    let genCalls = 0;
    const generateFn = async () => { genCalls++; };
    const compileCheckFn = async (): Promise<CompileResult> => makeFailingCompileCheck(genCalls);

    const loopResult = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 3,
    }, graph.tasks[0]!.title);

    expect(loopResult.finalPhase).toBe('ESCALATED');
    expect(loopResult.escalationReport).toBeDefined();

    // 3. Write escalation report to disk
    await writeEscalationReport(PROJECT_ROOT, taskId, loopResult.escalationReport!);
    const reportPath = join(GOAL_DIR, `escalated-${taskId}.json`);
    expect(existsSync(reportPath)).toBe(true);

    // 4. Mark task blocked
    const blockResult = await markTaskBlocked(PROJECT_ROOT, taskId, '3 failed iterations');
    expect(blockResult.success).toBe(true);

    // 5. Verify final state
    const loadResult = await loadGoal(PROJECT_ROOT);
    expect(loadResult.success).toBe(true);
    if (!loadResult.success) return;

    const task = loadResult.data.tasks.find((t) => t.id === taskId);
    expect(task!.status).toBe('blocked');

    // 6. Verify report content
    const reportContent = await readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);
    expect(report.iterationsAttempted).toBe(3);
    expect(report.errorHistory).toHaveLength(3);
  });
});
