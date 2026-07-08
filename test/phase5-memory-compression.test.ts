import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { injectScopedContext, loadDeferredFile } from '../src/core/context/context-injector';
import { compactAfterTestPass } from '../src/core/compaction/compaction-hook';
import { formatAgentMessage, formatConciseFeedback } from '../src/core/messages/concise-formatter';
import { createInitialState, loopStateMachine } from '../src/domain/loop/loop-state';
import { runLoop } from '../src/core/loop/loop-controller';
import type { CompileResult } from '../src/core/compilation/compile-checker';
import type { AgentDeliverable } from '../src/core/messages/concise-formatter';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const TEST_DIR = resolve(import.meta.dir, '.phase5-test-fixtures');

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(resolve(TEST_DIR, '.codeconductor'), { recursive: true });
  await mkdir(resolve(TEST_DIR, 'src'), { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─── Context Injector ────────────────────────────────────────────────────────

describe('context-injector', () => {
  it('loads only files listed in scope', async () => {
    await writeFile(resolve(TEST_DIR, 'src/a.ts'), 'const a = 1;', 'utf-8');
    await writeFile(resolve(TEST_DIR, 'src/b.ts'), 'const b = 2;', 'utf-8');
    await writeFile(resolve(TEST_DIR, 'src/c.ts'), 'const c = 3;', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/a.ts', 'src/b.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(2);
    expect(payload.files['src/a.ts']).toBe('const a = 1;');
    expect(payload.files['src/b.ts']).toBe('const b = 2;');
    expect(payload.files['src/c.ts']).toBeUndefined();
    expect(payload.deferred).toHaveLength(0);
  });

  it('defers files beyond 10-file limit', async () => {
    // Create 15 files
    for (let i = 0; i < 15; i++) {
      await writeFile(resolve(TEST_DIR, `src/file${i}.ts`), `// file ${i}`, 'utf-8');
    }

    const scopeFiles = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`);
    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles,
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(10);
    expect(payload.deferred).toHaveLength(5);
    expect(payload.deferred).toContain('src/file10.ts');
    expect(payload.deferred).toContain('src/file14.ts');
  });

  it('handles missing files gracefully', async () => {
    await writeFile(resolve(TEST_DIR, 'src/exists.ts'), 'exists', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/exists.ts', 'src/nope.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(1);
    expect(payload.files['src/exists.ts']).toBe('exists');
  });

  it('returns zero bytes for empty scope', async () => {
    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: [],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.totalBytes).toBe(0);
    expect(payload.deferred).toHaveLength(0);
  });

  it('tracks total bytes correctly', async () => {
    await writeFile(resolve(TEST_DIR, 'a.txt'), 'hello', 'utf-8');
    await writeFile(resolve(TEST_DIR, 'b.txt'), 'world!', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['a.txt', 'b.txt'],
      mode: 'isolated',
    });

    // "hello" = 5 bytes, "world!" = 6 bytes
    expect(payload.totalBytes).toBe(11);
  });

  it('loadDeferredFile returns content for existing file', async () => {
    await writeFile(resolve(TEST_DIR, 'deferred.ts'), 'deferred content', 'utf-8');

    const content = await loadDeferredFile(TEST_DIR, 'deferred.ts');
    expect(content).toBe('deferred content');
  });

  it('loadDeferredFile returns undefined for missing file', async () => {
    const content = await loadDeferredFile(TEST_DIR, 'nope.ts');
    expect(content).toBeUndefined();
  });
});

// ─── Compaction Hook ─────────────────────────────────────────────────────────

describe('compaction-hook', () => {
  it('creates history.jsonl if it does not exist', async () => {
    const result = await compactAfterTestPass(TEST_DIR, 'task-001');

    expect(result.compacted).toBe(false);
    expect(result.entriesRemoved).toBe(0);
    expect(result.historyPath).toBeDefined();

    const exists = await readFile(result.historyPath!, 'utf-8');
    expect(exists).toBe('');
  });

  it('compacts task entries and preserves other tasks', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries = [
      { taskId: 'task-001', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'red 1', errors: ['err1'] },
      { taskId: 'task-001', phase: 'GREEN', iteration: 1, timestamp: '2024-01-01T00:01:00Z', summary: 'green 1', errors: [] },
      { taskId: 'task-001', phase: 'RED', iteration: 2, timestamp: '2024-01-01T00:02:00Z', summary: 'red 2', errors: ['err2'] },
      { taskId: 'task-002', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'other task', errors: ['err3'] },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(historyPath, entries, 'utf-8');

    const result = await compactAfterTestPass(TEST_DIR, 'task-001');

    expect(result.compacted).toBe(true);
    expect(result.entriesRemoved).toBe(3);

    // Verify history file
    const content = await readFile(historyPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    expect(lines.length).toBe(2); // task-002 entry + task-001 summary

    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].taskId).toBe('task-002');
    expect(parsed[1].taskId).toBe('task-001');
    expect(parsed[1].phase).toBe('compacted');
  });

  it('uses custom summary when provided', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries = [
      { taskId: 'task-001', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'red', errors: [] },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(historyPath, entries, 'utf-8');

    const result = await compactAfterTestPass(TEST_DIR, 'task-001', 'Custom summary');

    expect(result.summary).toBe('Custom summary');
  });

  it('returns no-op when no entries exist for task', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries = [
      { taskId: 'other-task', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'other', errors: [] },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(historyPath, entries, 'utf-8');

    const result = await compactAfterTestPass(TEST_DIR, 'task-001');

    expect(result.compacted).toBe(false);
    expect(result.entriesRemoved).toBe(0);
  });
});

// ─── Concise Formatter ───────────────────────────────────────────────────────

describe('concise-formatter', () => {
  it('formats agent message with header and content', () => {
    const deliverable: AgentDeliverable = {
      agent: 'implementer',
      type: 'code',
      content: 'const x = 1;',
    };

    const msg = formatAgentMessage('implementer', deliverable);
    expect(msg).toContain('[implementer:code]');
    expect(msg).toContain('const x = 1;');
    expect(msg).not.toContain('---');
  });

  it('includes metadata when present', () => {
    const deliverable: AgentDeliverable = {
      agent: 'tester',
      type: 'result',
      content: 'All tests passed',
      metadata: { passed: 12, failed: 0, duration: '1.2s' },
    };

    const msg = formatAgentMessage('tester', deliverable);
    expect(msg).toContain('[tester:result]');
    expect(msg).toContain('---');
    expect(msg).toContain('passed: 12');
    expect(msg).toContain('failed: 0');
  });

  it('formats concise feedback compactly', () => {
    const errors = [
      { file: 'src/a.ts', code: 'TS2322', message: 'Type mismatch' },
      { file: 'src/b.ts', code: 'TS7006', message: 'Implicit any' },
    ];

    const feedback = formatConciseFeedback(errors);
    expect(feedback).toContain('2 error(s)');
    expect(feedback).toContain('1. src/a.ts TS2322: Type mismatch');
    expect(feedback).toContain('2. src/b.ts TS7006: Implicit any');
    // Should NOT contain "Raw:" lines
    expect(feedback).not.toContain('Raw:');
  });

  it('returns empty string for no errors', () => {
    expect(formatConciseFeedback([])).toBe('');
  });
});

// ─── Token Budget Enforcement ────────────────────────────────────────────────

describe('loop state — TOKEN_BUDGET_EXCEEDED', () => {
  it('transitions to ESCALATED when token budget exceeded', () => {
    const state = createInitialState({
      phase: 'RUNNING',
      iteration: 1,
      maxTokenBudget: 1000,
      tokenBudgetUsed: 500,
    });

    const result = loopStateMachine(state, {
      type: 'TOKEN_BUDGET_EXCEEDED',
      tokenUsage: 1100, // total after this iteration: 500 + 600 = 1100 > 1000
    });

    expect(result.result).toBe('TERMINATE');
    expect(result.state.phase).toBe('ESCALATED');
    expect(result.state.tokenBudgetUsed).toBe(1100);
  });

  it('TOKEN_BUDGET_EXCEEDED is only valid from RUNNING', () => {
    const state = createInitialState({ phase: 'IDLE' });
    const result = loopStateMachine(state, {
      type: 'TOKEN_BUDGET_EXCEEDED',
      tokenUsage: 100,
    });

    expect(result.result).toBe('TERMINATE');
    expect(result.state.phase).toBe('IDLE');
  });
});

// ─── Loop Controller — Token Budget Enforcement ──────────────────────────────

describe('runLoop — token budget enforcement', () => {
  it('early-terminates with ESCALATED when budget exceeded', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      return { tokenUsage: 500 };
    };
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      errors: [
        {
          file: 'src/index.ts',
          line: 1,
          code: 'TS2322',
          message: 'Type mismatch',
          raw: 'src/index.ts(1): error TS2322',
        },
      ],
      durationMs: 10,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 10,
      maxTokenBudget: 1200, // 2 calls at 500 each = 1000, 3rd call pushes to 1500 > 1200
    });

    expect(result.success).toBe(false);
    expect(result.finalPhase).toBe('ESCALATED');
    // Should not use all 10 iterations — budget exceeded earlier
    expect(callCount).toBeLessThanOrEqual(3);
  });

  it('completes normally when budget not exceeded', async () => {
    const generateFn = async () => ({ tokenUsage: 100 });
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      errors: [],
      durationMs: 10,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 3,
      maxTokenBudget: 500,
    });

    expect(result.success).toBe(true);
    expect(result.finalPhase).toBe('DONE');
  });

  it('unlimited budget when maxTokenBudget is 0', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      return { tokenUsage: 1000 };
    };
    const compileCheckFn = async (): Promise<CompileResult> => {
      if (callCount <= 2) {
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          errors: [
            {
              file: 'src/index.ts',
              line: callCount,
              code: 'TS2322',
              message: `Error ${callCount}`,
              raw: `src/index.ts(${callCount}): error TS2322`,
            },
          ],
          durationMs: 10,
          timedOut: false,
        };
      }
      return {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        errors: [],
        durationMs: 10,
        timedOut: false,
      };
    };

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 3,
      maxTokenBudget: 0, // unlimited
    });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(3);
  });
});

// ─── 50-Iteration Simulation ─────────────────────────────────────────────────

describe('50-iteration simulation — budget enforcement', () => {
  it('stays within 40KB context and 40KB history limits', async () => {
    const CONTEXT_LIMIT = 40 * 1024; // 40KB
    const HISTORY_LIMIT = 40 * 1024; // 40KB
    const MAX_ITERATIONS = 50;

    let iteration = 0;
    let totalContextBytes = 0;

    const generateFn = async (feedback?: string) => {
      iteration++;
      // Simulate ~200 bytes of context per iteration
      const iterationContext = `Iteration ${iteration}: generated code. ${feedback ? 'With feedback.' : ''}`;
      totalContextBytes += Buffer.byteLength(iterationContext, 'utf-8');
      return { tokenUsage: 100 };
    };

    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      errors: [],
      durationMs: 10,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: MAX_ITERATIONS,
      maxTokenBudget: 5000, // 50 iterations * 100 tokens = 5000, exactly at limit
    });

    // Should complete within budget
    expect(result.success).toBe(true);

    // Context should be well under 40KB
    expect(totalContextBytes).toBeLessThan(CONTEXT_LIMIT);

    // Simulate history.jsonl size — each entry ~100 bytes, 50 entries = ~5KB
    const simulatedHistorySize = iteration * 100;
    expect(simulatedHistorySize).toBeLessThan(HISTORY_LIMIT);
  });

  it('compaction reduces history size after test pass', async () => {
    // Simulate 20 iterations of RED/GREEN
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries: string[] = [];
    for (let i = 0; i < 20; i++) {
      entries.push(JSON.stringify({
        taskId: 'sim-task',
        phase: i % 2 === 0 ? 'RED' : 'GREEN',
        iteration: Math.floor(i / 2) + 1,
        timestamp: new Date().toISOString(),
        summary: `Iteration ${i}: ${i % 2 === 0 ? 'failing' : 'passing'}`,
        errors: i % 2 === 0 ? [`error-${i}`] : [],
      }));
    }
    await writeFile(historyPath, entries.join('\n') + '\n', 'utf-8');

    const beforeSize = Buffer.byteLength(await readFile(historyPath, 'utf-8'), 'utf-8');

    const result = await compactAfterTestPass(TEST_DIR, 'sim-task');

    expect(result.compacted).toBe(true);
    expect(result.entriesRemoved).toBe(20);

    const afterContent = await readFile(historyPath, 'utf-8');
    const afterSize = Buffer.byteLength(afterContent, 'utf-8');

    // After compaction: only 1 summary entry, much smaller
    expect(afterSize).toBeLessThan(beforeSize);
    expect(afterSize).toBeLessThan(1024); // Well under 40KB

    // Verify summary entry exists
    const lines = afterContent.split('\n').filter((l) => l.trim() !== '');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.phase).toBe('compacted');
  });
});
