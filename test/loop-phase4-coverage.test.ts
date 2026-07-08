/**
 * Coverage extension for Phase 4: DDD→SDD→TDD pipeline.
 *
 * This file complements `test/loop-phase4-integration.test.ts` (the 5
 * critical tests shipped with the Phase 4 deliverable). The integration
 * test file covers the four acceptance criteria at the integration
 * boundary; this file targets the secondary acceptance signals and
 * edge cases listed in the verification brief:
 *
 *   - markTaskBlocked: already-blocked (idempotency), missing goal file
 *   - writeEscalationReport: JSON shape, special characters, missing dir
 *   - docs/routing-policy.md: v0.3.0, DDD→SDD→TDD row, TDD Loop Guard
 *   - AGENTS.md: contract-builder definition, routing row
 *   - runLoop: shorter maxIterations, all-success path, stuck-loop
 *     recommendedAction, max-iterations recommendedAction
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runLoop, type EscalationReport } from '../src/core/loop/loop-controller';
import { writeEscalationReport } from '../src/core/loop/escalation-emitter';
import { loadGoal, markTaskBlocked, writeGoal } from '../src/core/goal/goal-state';
import { planGoal } from '../src/core/goal/goal-planner';
import type { CompileResult } from '../src/core/compilation/compile-checker';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const GOAL_DIR = join(PROJECT_ROOT, '.codeconductor');
const ROUTING_POLICY = join(PROJECT_ROOT, 'docs', 'routing-policy.md');
const AGENTS_MD = join(PROJECT_ROOT, 'AGENTS.md');

async function cleanup() {
  try {
    await rm(GOAL_DIR, { recursive: true, force: true });
  } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Mock compile result that varies the error per iteration so the loop
 * does not trip the stuck-loop early-escalation (identical errors across
 * two consecutive iterations short-circuit to ESCALATED at iteration 2).
 */
function varyingFailingCompile(iteration: number): CompileResult {
  return {
    success: false,
    exitCode: 1,
    stdout: '',
    stderr: `src/file${iteration}.ts(1,1): error TS1${String(iteration).padStart(3, '0')}: error on iteration ${iteration}`,
    errors: [
      {
        file: `src/file${iteration}.ts`,
        line: 1,
        column: 1,
        code: `TS1${String(iteration).padStart(3, '0')}`,
        message: `error on iteration ${iteration}`,
        raw: `src/file${iteration}.ts(1,1): error TS1${String(iteration).padStart(3, '0')}: error on iteration ${iteration}`,
      },
    ],
    durationMs: 1,
    timedOut: false,
  };
}

// ─── markTaskBlocked: edge cases ─────────────────────────────────────────────

describe('Phase 4 coverage: markTaskBlocked edge cases', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('marking a task already blocked is idempotent (status stays blocked)', async () => {
    // Setup: write a goal graph
    const graph = planGoal('Build a user authentication API');
    await writeGoal(PROJECT_ROOT, graph);
    const taskId = graph.tasks[0]!.id;

    // First block: pending → blocked
    const first = await markTaskBlocked(PROJECT_ROOT, taskId, 'first reason');
    expect(first.success).toBe(true);

    // Reload and confirm blocked
    const load1 = await loadGoal(PROJECT_ROOT);
    if (!load1.success) throw new Error('expected load success');
    const task1 = load1.data.tasks.find((t) => t.id === taskId);
    expect(task1!.status).toBe('blocked');

    // Second block: blocked → blocked (no error, no status change)
    const second = await markTaskBlocked(PROJECT_ROOT, taskId, 'second reason');
    expect(second.success).toBe(true);

    // Reload and confirm still blocked
    const load2 = await loadGoal(PROJECT_ROOT);
    if (!load2.success) throw new Error('expected load success');
    const task2 = load2.data.tasks.find((t) => t.id === taskId);
    expect(task2!.status).toBe('blocked');
  });

  test('markTaskBlocked returns error when no goal file exists', async () => {
    // No writeGoal call — the .codeconductor/current-goal.yml file does not exist.
    const result = await markTaskBlocked(PROJECT_ROOT, 'any-task', 'reason');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(Error);
    // loadGoal surfaces the ENOENT / parse error — we only assert it's an Error
    // so this test does not couple to the OS-specific message.
  });

  test('marking one task as blocked leaves dependent tasks unaffected', async () => {
    const graph = planGoal('Build a CRUD API for products');
    await writeGoal(PROJECT_ROOT, graph);

    // Block the first task in the chain
    const firstTaskId = graph.tasks[0]!.id;
    const blockResult = await markTaskBlocked(PROJECT_ROOT, firstTaskId, 'stuck');
    expect(blockResult.success).toBe(true);

    // Reload and check statuses
    const load = await loadGoal(PROJECT_ROOT);
    if (!load.success) throw new Error('expected load success');

    const statuses = load.data.tasks.map((t) => t.status);
    expect(statuses[0]).toBe('blocked');
    // All other tasks must remain 'pending' — markTaskBlocked only mutates the
    // target task, it does not cascade.
    for (let i = 1; i < statuses.length; i++) {
      expect(statuses[i]).toBe('pending');
    }
  });
});

// ─── writeEscalationReport: JSON shape and edge cases ───────────────────────

describe('Phase 4 coverage: writeEscalationReport', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('written JSON contains all six required fields', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    const report: EscalationReport = {
      taskTitle: 'shape-test',
      iterationsAttempted: 3,
      errorHistory: [
        [{ file: 'a.ts', line: 1, code: 'TS1001', message: 'm1', raw: 'r1' }],
      ],
      attemptedFixes: ['Iteration 1: 1 error(s) — TS1001: m1'],
      originalContext: 'ctx',
      recommendedAction: 'rec',
    };

    await writeEscalationReport(PROJECT_ROOT, 'task-shape', report);

    const content = await readFile(join(GOAL_DIR, 'escalated-task-shape.json'), 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    expect(typeof parsed.taskTitle).toBe('string');
    expect(typeof parsed.iterationsAttempted).toBe('number');
    expect(Array.isArray(parsed.errorHistory)).toBe(true);
    expect(Array.isArray(parsed.attemptedFixes)).toBe(true);
    expect(typeof parsed.originalContext).toBe('string');
    expect(typeof parsed.recommendedAction).toBe('string');
  });

  test('JSON is pretty-printed with 2-space indentation', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    const report: EscalationReport = {
      taskTitle: 'indent',
      iterationsAttempted: 1,
      errorHistory: [[]],
      attemptedFixes: [],
      originalContext: 'ctx',
      recommendedAction: 'rec',
    };

    await writeEscalationReport(PROJECT_ROOT, 't-indent', report);

    const content = await readFile(join(GOAL_DIR, 'escalated-t-indent.json'), 'utf-8');
    // Pretty-print signature: top-level key must be followed by newline + 2 spaces.
    expect(content).toMatch(/^{\n {2}"taskTitle":/);
  });

  test('special characters in fields are JSON-escaped (quotes, newlines, unicode)', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    const report: EscalationReport = {
      taskTitle: 'task "with quotes" and éàü',
      iterationsAttempted: 1,
      errorHistory: [[]],
      attemptedFixes: [],
      originalContext: 'line1\nline2\twith tab',
      recommendedAction: 'use `npm` && `tsc`',
    };

    await writeEscalationReport(PROJECT_ROOT, 't-escape', report);

    const filePath = join(GOAL_DIR, 'escalated-t-escape.json');
    const content = await readFile(filePath, 'utf-8');

    // File is valid JSON (the parser round-trips it)
    const parsed = JSON.parse(content) as EscalationReport;
    expect(parsed.taskTitle).toBe('task "with quotes" and éàü');
    expect(parsed.originalContext).toBe('line1\nline2\twith tab');
    expect(parsed.recommendedAction).toBe('use `npm` && `tsc`');

    // Raw bytes show JSON-escaped quotes inside the string
    expect(content).toContain('\\"with quotes\\"');
    expect(content).toContain('\\n');
    expect(content).toContain('\\t');
  });

  test('nested errorHistory structure (array of arrays) round-trips exactly', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    const report: EscalationReport = {
      taskTitle: 'nested',
      iterationsAttempted: 2,
      errorHistory: [
        [
          { file: 'a.ts', line: 1, code: 'TS1', message: 'm1', raw: 'r1' },
          { file: 'b.ts', line: 2, code: 'TS2', message: 'm2', raw: 'r2' },
        ],
        [
          { file: 'c.ts', line: 3, code: 'TS3', message: 'm3', raw: 'r3' },
        ],
      ],
      attemptedFixes: [],
      originalContext: 'ctx',
      recommendedAction: 'rec',
    };

    await writeEscalationReport(PROJECT_ROOT, 't-nested', report);
    const content = await readFile(join(GOAL_DIR, 'escalated-t-nested.json'), 'utf-8');
    const parsed = JSON.parse(content) as EscalationReport;

    expect(parsed.errorHistory).toHaveLength(2);
    expect(parsed.errorHistory[0]).toHaveLength(2);
    expect(parsed.errorHistory[0]![0]!.file).toBe('a.ts');
    expect(parsed.errorHistory[0]![1]!.code).toBe('TS2');
    expect(parsed.errorHistory[1]).toHaveLength(1);
    expect(parsed.errorHistory[1]![0]!.message).toBe('m3');
  });

  test('throws when .codeconductor/ directory does not exist (no auto-mkdir)', async () => {
    // No mkdir, no writeGoal — .codeconductor/ is absent.
    await cleanup();
    const report: EscalationReport = {
      taskTitle: 'no-dir',
      iterationsAttempted: 1,
      errorHistory: [[]],
      attemptedFixes: [],
      originalContext: 'ctx',
      recommendedAction: 'rec',
    };

    await expect(
      writeEscalationReport(PROJECT_ROOT, 't-no-dir', report),
    ).rejects.toThrow();
  });

  test('file naming follows escalated-<taskId>.json pattern', async () => {
    await mkdir(GOAL_DIR, { recursive: true });
    const report: EscalationReport = {
      taskTitle: 'naming',
      iterationsAttempted: 1,
      errorHistory: [[]],
      attemptedFixes: [],
      originalContext: 'ctx',
      recommendedAction: 'rec',
    };

    await writeEscalationReport(PROJECT_ROOT, 'my-task-123', report);

    // File exists at the documented path
    expect(existsSync(join(GOAL_DIR, 'escalated-my-task-123.json'))).toBe(true);
  });
});

// ─── runLoop: additional behavioral coverage ─────────────────────────────────

describe('Phase 4 coverage: runLoop additional scenarios', () => {
  test('maxIterations=1 escalates after a single failed iteration', async () => {
    let genCalls = 0;
    const generateFn = async () => { genCalls++; };
    const compileCheckFn = async (): Promise<CompileResult> => varyingFailingCompile(1);

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 1 }, 'single-iter');

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(1);
    expect(result.finalPhase).toBe('ESCALATED');
    expect(genCalls).toBe(1);
    expect(result.escalationReport).toBeDefined();
  });

  test('all-success run returns DONE and never produces an escalation report', async () => {
    const generateFn = async () => {};
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      errors: [],
      durationMs: 1,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.finalPhase).toBe('DONE');
    expect(result.totalErrors).toBe(0);
    expect(result.escalationReport).toBeUndefined();
  });

  test('escalation report recommendedAction is "stuck loop" when last 2 iterations are identical', async () => {
    // Same error on every iteration → triggers the stuck-loop early-escalation.
    const sameError: CompileResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'a.ts(1,1): error TS0001: same',
      errors: [{ file: 'a.ts', line: 1, column: 1, code: 'TS0001', message: 'same', raw: 'a.ts(1,1): error TS0001: same' }],
      durationMs: 1,
      timedOut: false,
    };

    const result = await runLoop(
      async () => {},
      async () => sameError,
      { maxIterations: 5 },
      'stuck',
    );

    expect(result.finalPhase).toBe('ESCALATED');
    expect(result.escalationReport).toBeDefined();
    expect(result.escalationReport!.recommendedAction).toMatch(/identical across consecutive iterations/);
    expect(result.escalationReport!.recommendedAction).toMatch(/Manual intervention/);
  });

  test('escalation report recommendedAction is "max iterations" when errors differ each iteration', async () => {
    let n = 0;
    const result = await runLoop(
      async () => {},
      async () => varyingFailingCompile(++n),
      { maxIterations: 3 },
      'differ',
    );

    expect(result.finalPhase).toBe('ESCALATED');
    expect(result.escalationReport).toBeDefined();
    expect(result.escalationReport!.recommendedAction).toMatch(/Max iterations reached with remaining errors/);
  });

  test('escalation report attempts match the failing-iteration count', async () => {
    let n = 0;
    const result = await runLoop(
      async () => {},
      async () => varyingFailingCompile(++n),
      { maxIterations: 3 },
      'attempt-count',
    );

    expect(result.iterations).toBe(3);
    expect(result.escalationReport!.iterationsAttempted).toBe(3);
    expect(result.escalationReport!.errorHistory).toHaveLength(3);
    expect(result.escalationReport!.attemptedFixes).toHaveLength(3);
  });
});

// ─── docs/routing-policy.md: Phase 4 content contract ───────────────────────

describe('Phase 4 coverage: docs/routing-policy.md', () => {
  test('declares v0.3.0 as the current version', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    expect(content).toMatch(/\*\*Version:\*\*\s*v?0\.3\.0/);
  });

  test('routing table includes a DDD→SDD→TDD pipeline row', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    // The row should be present with all four agents in the documented order.
    const row = content.match(
      /\|\s*DDD[→\-]>?SDD[→\-]>?TDD pipeline[^|]*\|[^|]*\|[^|]*contract-builder[^|]*architect[^|]*implementer[^|]*tester/i,
    );
    expect(row).not.toBeNull();
  });

  test('contains a TDD Loop Guard section', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    expect(content).toMatch(/^##\s+TDD Loop Guard/m);
  });

  test('TDD Loop Guard section documents escalation at the 3rd failed iteration', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    const section = content.match(/^##\s+TDD Loop Guard[\s\S]*?(?=\n##\s|\Z)/m);
    expect(section).not.toBeNull();
    if (section) {
      // 3rd iteration halt
      expect(section[0]).toMatch(/3rd|third/i);
      // markTaskBlocked reference
      expect(section[0]).toMatch(/markTaskBlocked/);
      // escalation report filename pattern
      expect(section[0]).toMatch(/escalated-<taskId>\.json/);
      // 5 required report fields
      expect(section[0]).toMatch(/iterations attempted/);
      expect(section[0]).toMatch(/error history/);
      expect(section[0]).toMatch(/attempted fixes/);
      expect(section[0]).toMatch(/original context/);
      expect(section[0]).toMatch(/recommended action/);
    }
  });

  test('version history includes a v0.3.0 entry with the DDD→SDD→TDD summary', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    const row = content.match(/\|\s*v0\.3\.0\s*\|[^|]*\|[^|]*DDD[→\-]>?SDD[→\-]>?TDD/i);
    expect(row).not.toBeNull();
  });
});

// ─── AGENTS.md: contract-builder definition ─────────────────────────────────

describe('Phase 4 coverage: AGENTS.md contract-builder', () => {
  test('defines a `contract-builder` agent section', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');
    expect(content).toMatch(/^###\s+contract-builder/m);
  });

  test('contract-builder section includes Role, Use when, Permissions, Does not', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');
    const section = content.match(
      /###\s+contract-builder[\s\S]*?(?=\n###\s|\n##\s|\Z)/,
    );
    expect(section).not.toBeNull();
    if (section) {
      expect(section[0]).toMatch(/\*\*Role:\*\*/);
      expect(section[0]).toMatch(/\*\*Use when:\*\*/);
      expect(section[0]).toMatch(/\*\*Permissions:\*\*/);
      expect(section[0]).toMatch(/\*\*Does not:\*\*/);
    }
  });

  test('contract-builder does NOT have write permission for source code', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');
    const section = content.match(
      /###\s+contract-builder[\s\S]*?(?=\n###\s|\n##\s|\Z)/,
    );
    expect(section).not.toBeNull();
    if (section) {
      // The agent must not modify source files.
      expect(section[0]).toMatch(/Modify source files|Write implementation code/);
    }
  });

  test('agent routing table contains a DDD→SDD→TDD pipeline row', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');
    const row = content.match(
      /\|\s*DDD[→\-]>?SDD[→\-]>?TDD pipeline[^|]*\|[^|]*\|[^|]*contract-builder[^|]*architect[^|]*implementer[^|]*tester/i,
    );
    expect(row).not.toBeNull();
  });
});
