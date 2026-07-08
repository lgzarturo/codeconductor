import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { injectScopedContext, loadDeferredFile } from '../src/core/context/context-injector';
import { compactAfterTestPass } from '../src/core/compaction/compaction-hook';
import { formatAgentMessage, formatConciseFeedback } from '../src/core/messages/concise-formatter';
import { runLoop } from '../src/core/loop/loop-controller';
import type { CompileResult } from '../src/core/compilation/compile-checker';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const TEST_DIR = resolve(import.meta.dir, '.phase5-edge-fixtures');

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(resolve(TEST_DIR, '.codeconductor'), { recursive: true });
  await mkdir(resolve(TEST_DIR, 'src'), { recursive: true });
  await mkdir(resolve(TEST_DIR, 'src/nested/deep'), { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─── Context Injector — boundary conditions ──────────────────────────────────

describe('context-injector — boundary conditions', () => {
  it('loads exactly 10 files without deferral (off-by-one boundary)', async () => {
    // Create 10 files — the eager limit itself
    for (let i = 0; i < 10; i++) {
      await writeFile(resolve(TEST_DIR, `src/bound${i}.ts`), `// boundary ${i}`, 'utf-8');
    }

    const scopeFiles = Array.from({ length: 10 }, (_, i) => `src/bound${i}.ts`);
    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles,
      mode: 'isolated',
    });

    // Exact boundary — all 10 fit, none deferred
    expect(payload.fileCount).toBe(10);
    expect(payload.deferred).toHaveLength(0);
    expect(Object.keys(payload.files)).toHaveLength(10);
  });

  it('defers exactly one file when scope has 11 entries (boundary+1)', async () => {
    for (let i = 0; i < 11; i++) {
      await writeFile(resolve(TEST_DIR, `src/eleven${i}.ts`), `// ${i}`, 'utf-8');
    }

    const scopeFiles = Array.from({ length: 11 }, (_, i) => `src/eleven${i}.ts`);
    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles,
      mode: 'isolated',
    });

    // 11th file (index 10) is the one deferred
    expect(payload.fileCount).toBe(10);
    expect(payload.deferred).toHaveLength(1);
    expect(payload.deferred).toContain('src/eleven10.ts');
    expect(payload.files['src/eleven9.ts']).toBeDefined();
  });

  it('handles scope with all files missing', async () => {
    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['missing1.ts', 'missing2.ts', 'missing3.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.totalBytes).toBe(0);
    expect(payload.deferred).toHaveLength(0);
    expect(Object.keys(payload.files)).toHaveLength(0);
  });

  it('handles files in nested subdirectories', async () => {
    await writeFile(resolve(TEST_DIR, 'src/nested/file.ts'), 'nested content', 'utf-8');
    await writeFile(resolve(TEST_DIR, 'src/nested/deep/deep.ts'), 'deep content', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/nested/file.ts', 'src/nested/deep/deep.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(2);
    expect(payload.files['src/nested/file.ts']).toBe('nested content');
    expect(payload.files['src/nested/deep/deep.ts']).toBe('deep content');
  });

  it('preserves special characters and newlines in file content', async () => {
    const special = 'line1\nline2\n\ttabbed\nunicode: \u4e2d\u6587\n';
    await writeFile(resolve(TEST_DIR, 'src/special.ts'), special, 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/special.ts'],
      mode: 'isolated',
    });

    expect(payload.files['src/special.ts']).toBe(special);
    // Byte length includes multi-byte unicode (3 bytes per Chinese char)
    expect(payload.totalBytes).toBe(Buffer.byteLength(special, 'utf-8'));
  });

  it('behavior is identical across all mode variants (isolated, continuation, full)', async () => {
    await writeFile(resolve(TEST_DIR, 'a.ts'), 'A', 'utf-8');
    await writeFile(resolve(TEST_DIR, 'b.ts'), 'B', 'utf-8');

    for (const mode of ['isolated', 'continuation', 'full'] as const) {
      const payload = await injectScopedContext(TEST_DIR, {
        scopeFiles: ['a.ts', 'b.ts'],
        mode,
      });
      expect(payload.fileCount).toBe(2);
      expect(payload.files['a.ts']).toBe('A');
      expect(payload.files['b.ts']).toBe('B');
    }
  });

  it('loadDeferredFile reads from nested subdirectories', async () => {
    await writeFile(resolve(TEST_DIR, 'src/nested/deep/file.ts'), 'deep', 'utf-8');

    const content = await loadDeferredFile(TEST_DIR, 'src/nested/deep/file.ts');
    expect(content).toBe('deep');
  });

  it('handles large file content (1MB) without issue', async () => {
    const largeContent = 'x'.repeat(1024 * 1024); // 1MB
    await writeFile(resolve(TEST_DIR, 'src/large.ts'), largeContent, 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/large.ts'],
      mode: 'isolated',
    }, { maxContextBytes: 2 * 1024 * 1024 });

    expect(payload.fileCount).toBe(1);
    expect(payload.totalBytes).toBe(1024 * 1024);
    expect(payload.files['src/large.ts']?.length).toBe(1024 * 1024);
    expect(payload.truncated).toBe(false);
  });
});

// ─── Compaction Hook — edge cases ────────────────────────────────────────────

describe('compaction-hook — edge cases', () => {
  it('compaction does not accumulate duplicate summary entries on repeated calls', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries = [
      { taskId: 'task-A', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'red', errors: [] },
      { taskId: 'task-A', phase: 'GREEN', iteration: 1, timestamp: '2024-01-01T00:01:00Z', summary: 'green', errors: [] },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(historyPath, entries, 'utf-8');

    const first = await compactAfterTestPass(TEST_DIR, 'task-A');
    expect(first.compacted).toBe(true);
    expect(first.entriesRemoved).toBe(2);

    // Run compaction again 3 more times
    await compactAfterTestPass(TEST_DIR, 'task-A');
    await compactAfterTestPass(TEST_DIR, 'task-A');
    const last = await compactAfterTestPass(TEST_DIR, 'task-A');

    // File must contain exactly 1 entry (the summary), regardless of how many times we call
    const content = await readFile(historyPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.taskId).toBe('task-A');
    expect(parsed.phase).toBe('compacted');
    // Last call returns the auto-generated summary
    expect(last.summary).toContain('compacted');
  });

  it('skips malformed JSON lines without throwing', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const lines = [
      'this is not json',
      JSON.stringify({ taskId: 'task-X', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'red', errors: [] }),
      '{broken json,',
      JSON.stringify({ taskId: 'task-X', phase: 'GREEN', iteration: 1, timestamp: '2024-01-01T00:01:00Z', summary: 'green', errors: [] }),
      '',
    ];
    await writeFile(historyPath, lines.join('\n'), 'utf-8');

    const result = await compactAfterTestPass(TEST_DIR, 'task-X');

    // Should have found and compacted the 2 valid entries
    expect(result.compacted).toBe(true);
    expect(result.entriesRemoved).toBe(2);
  });

  it('handles file containing only whitespace and newlines', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    await writeFile(historyPath, '\n\n  \n\t\n', 'utf-8');

    const result = await compactAfterTestPass(TEST_DIR, 'task-empty');

    expect(result.compacted).toBe(false);
    expect(result.entriesRemoved).toBe(0);
  });

  it('preserves order of other tasks during compaction', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries = [
      { taskId: 'task-A', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'a1', errors: [] },
      { taskId: 'task-B', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:01Z', summary: 'b1', errors: [] },
      { taskId: 'task-A', phase: 'GREEN', iteration: 1, timestamp: '2024-01-01T00:00:02Z', summary: 'a2', errors: [] },
      { taskId: 'task-C', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:03Z', summary: 'c1', errors: [] },
      { taskId: 'task-B', phase: 'GREEN', iteration: 1, timestamp: '2024-01-01T00:00:04Z', summary: 'b2', errors: [] },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(historyPath, entries, 'utf-8');

    await compactAfterTestPass(TEST_DIR, 'task-A');

    const content = await readFile(historyPath, 'utf-8');
    const parsed = content
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l));

    // Order: B-RED, C-RED, B-GREEN (preserved from original), then A-summary
    // The filter preserves original order of other entries
    expect(parsed).toHaveLength(4);
    expect(parsed[0]?.taskId).toBe('task-B');
    expect(parsed[0]?.phase).toBe('RED');
    expect(parsed[1]?.taskId).toBe('task-C');
    expect(parsed[2]?.taskId).toBe('task-B');
    expect(parsed[2]?.phase).toBe('GREEN');
    expect(parsed[3]?.taskId).toBe('task-A');
    expect(parsed[3]?.phase).toBe('compacted');
  });

  it('compacts each task independently when called multiple times', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries = [
      { taskId: 'task-A', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'a', errors: [] },
      { taskId: 'task-B', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:01Z', summary: 'b', errors: [] },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(historyPath, entries, 'utf-8');

    const resultA = await compactAfterTestPass(TEST_DIR, 'task-A');
    expect(resultA.entriesRemoved).toBe(1);

    const resultB = await compactAfterTestPass(TEST_DIR, 'task-B');
    expect(resultB.entriesRemoved).toBe(1);

    const content = await readFile(historyPath, 'utf-8');
    const parsed = content
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l));
    expect(parsed).toHaveLength(2);
    expect(parsed.every((e) => e.phase === 'compacted')).toBe(true);
  });

  it('handles large history file (100+ entries) gracefully', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries: string[] = [];
    for (let i = 0; i < 150; i++) {
      entries.push(JSON.stringify({
        taskId: 'big-task',
        phase: i % 2 === 0 ? 'RED' : 'GREEN',
        iteration: i,
        timestamp: '2024-01-01T00:00:00Z',
        summary: `entry ${i}`,
        errors: [],
      }));
    }
    await writeFile(historyPath, entries.join('\n') + '\n', 'utf-8');

    const result = await compactAfterTestPass(TEST_DIR, 'big-task');

    expect(result.compacted).toBe(true);
    expect(result.entriesRemoved).toBe(150);

    const content = await readFile(historyPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).taskId).toBe('big-task');
  });

  it('summary entry has correct shape after compaction', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries = [
      { taskId: 'task-shape', phase: 'RED', iteration: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'red', errors: ['err1'] },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(historyPath, entries, 'utf-8');

    await compactAfterTestPass(TEST_DIR, 'task-shape', 'My custom summary');

    const content = await readFile(historyPath, 'utf-8');
    const parsed = JSON.parse(content.split('\n').filter((l) => l.trim() !== '')[0]!);

    // Verify the summary entry has the expected shape
    expect(parsed.taskId).toBe('task-shape');
    expect(parsed.phase).toBe('compacted');
    expect(parsed.iteration).toBe(0);
    expect(parsed.summary).toBe('My custom summary');
    expect(parsed.errors).toEqual([]);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO date
  });
});

// ─── Concise Formatter — edge cases ───────────────────────────────────────────

describe('concise-formatter — edge cases', () => {
  it('formats message with empty content and metadata', () => {
    const deliverable = {
      agent: 'orchestrator',
      type: 'status',
      content: '',
      metadata: { phase: 'RUNNING' },
    };

    const msg = formatAgentMessage('orchestrator', deliverable);
    expect(msg).toContain('[orchestrator:status]');
    expect(msg).toContain('---');
    expect(msg).toContain('phase: RUNNING');
  });

  it('formats message with empty metadata object (no footer rendered)', () => {
    const deliverable = {
      agent: 'tester',
      type: 'result',
      content: 'OK',
      metadata: {},
    };

    const msg = formatAgentMessage('tester', deliverable);
    expect(msg).toContain('[tester:result]');
    expect(msg).toContain('OK');
    expect(msg).not.toContain('---'); // No footer for empty metadata
  });

  it('formats metadata with various value types', () => {
    const deliverable = {
      agent: 'mixed',
      type: 'report',
      content: 'data',
      metadata: {
        count: 42,
        enabled: true,
        tags: ['a', 'b', 'c'],
        name: 'test',
      },
    };

    const msg = formatAgentMessage('mixed', deliverable);
    expect(msg).toContain('count: 42');
    expect(msg).toContain('enabled: true');
    expect(msg).toContain('tags: a, b, c');
    expect(msg).toContain('name: test');
  });

  it('preserves newlines and special characters in content', () => {
    const deliverable = {
      agent: 'implementer',
      type: 'code',
      content: 'function foo() {\n  return 1;\n}\n// unicode: \u00e1\u00e9\u00ed',
    };

    const msg = formatAgentMessage('implementer', deliverable);
    expect(msg).toContain('function foo() {');
    expect(msg).toContain('  return 1;');
    expect(msg).toContain('// unicode: \u00e1\u00e9\u00ed');
  });

  it('omits agent self-summary (no commentary before deliverable)', () => {
    const deliverable = {
      agent: 'implementer',
      type: 'code',
      content: 'const x = 1;',
    };

    const msg = formatAgentMessage('implementer', deliverable);
    // The message must start with the header, not a commentary line
    expect(msg.startsWith('[implementer:code]')).toBe(true);
    // No phrases like "I have completed", "Here is the", etc.
    expect(msg).not.toMatch(/I have|Here is|I created|I wrote|This completes/);
  });

  it('formats error feedback with only message (no file, no code)', () => {
    const errors = [
      { message: 'Generic error' },
    ];

    const feedback = formatConciseFeedback(errors);
    expect(feedback).toContain('1 error(s)');
    expect(feedback).toContain('1. : Generic error');
  });

  it('formats error feedback with file but no code', () => {
    const errors = [
      { file: 'src/x.ts', message: 'broken' },
    ];

    const feedback = formatConciseFeedback(errors);
    // Format: "{file} {code}: {message}" — when code missing, no extra space
    expect(feedback).toContain('1. src/x.ts: broken');
    // Verify the structure: "N error(s):\n\nN. {location}: {message}"
    expect(feedback).toBe('1 error(s):\n\n1. src/x.ts: broken');
  });

  it('formats single error compactly', () => {
    const errors = [
      { file: 'a.ts', code: 'E1', message: 'one' },
    ];

    const feedback = formatConciseFeedback(errors);
    expect(feedback).toContain('1 error(s):');
    expect(feedback).toContain('1. a.ts E1: one');
  });

  it('formats many errors with compact numbering', () => {
    const errors = Array.from({ length: 10 }, (_, i) => ({
      file: `f${i}.ts`,
      code: `E${i}`,
      message: `error ${i}`,
    }));

    const feedback = formatConciseFeedback(errors);
    expect(feedback).toContain('10 error(s):');
    expect(feedback).toContain('1. f0.ts E0: error 0');
    expect(feedback).toContain('10. f9.ts E9: error 9');
  });
});

// ─── Token Budget — boundary and accumulation edge cases ─────────────────────

describe('token budget — boundary and accumulation', () => {
  it('does NOT escalate when token usage exactly equals budget', async () => {
    // Budget = 500, total usage = 500 → not exceeded (only > triggers)
    const generateFn = async () => ({ tokenUsage: 500 });
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
      maxTokenBudget: 500, // exactly matches
    });

    // Should NOT escalate — usage equals but does not exceed budget
    expect(result.success).toBe(true);
    expect(result.finalPhase).toBe('DONE');
  });

  it('accumulates token usage across iterations', async () => {
    let callCount = 0;
    const usagePerCall = 100;
    const generateFn = async () => {
      callCount++;
      return { tokenUsage: usagePerCall };
    };

    // 1st call: 100 (within budget), 2nd call: 200, 3rd: 300, 4th: 400, 5th: 500 (still <= 500)
    // Budget = 500, after 6th call → 600 > 500 → ESCALATE
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      errors: [
        { file: 'x.ts', line: 1, code: 'E1', message: 'err', raw: 'x.ts(1): error E1' },
      ],
      durationMs: 10,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 10,
      maxTokenBudget: 500,
    });

    expect(result.success).toBe(false);
    expect(result.finalPhase).toBe('ESCALATED');
    // Should have called at most 6 times (500, then 600 triggers escalation)
    expect(callCount).toBeLessThanOrEqual(6);
  });

  it('handles zero token usage per call (no budget pressure)', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      return { tokenUsage: 0 };
    };
    // Vary the error per iteration to avoid stuck-loop detection
    const compileCheckFn = async (): Promise<CompileResult> => {
      if (callCount < 3) {
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          errors: [
            {
              file: `x${callCount}.ts`,
              line: callCount,
              code: `E${callCount}`,
              message: `err ${callCount}`,
              raw: `x${callCount}.ts(${callCount}): error E${callCount}`,
            },
          ],
          durationMs: 10,
          timedOut: false,
        };
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', errors: [], durationMs: 10, timedOut: false };
    };

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 5,
      maxTokenBudget: 100, // low budget, but zero usage = no pressure
    });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(3);
  });

  it('escalates on first iteration when single call exceeds budget', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      return { tokenUsage: 10000 }; // massive usage
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
      maxIterations: 10,
      maxTokenBudget: 100, // tiny budget
    });

    // First call (10000) immediately exceeds budget (100) → ESCALATE
    expect(result.success).toBe(false);
    expect(result.finalPhase).toBe('ESCALATED');
    expect(callCount).toBe(1);
  });
});

// ─── 50-iteration simulation variations ──────────────────────────────────────

describe('50-iteration simulation — scope variations', () => {
  it('small scope (1 file) over 50 iterations stays under 40KB history', async () => {
    // Simulate history growth with 1 file context
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries: string[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push(JSON.stringify({
        taskId: 'small-scope',
        phase: 'RED',
        iteration: i + 1,
        timestamp: new Date().toISOString(),
        summary: `iter ${i}`,
        errors: [`error-${i}`],
      }));
    }
    await writeFile(historyPath, entries.join('\n') + '\n', 'utf-8');

    const historySize = Buffer.byteLength(await readFile(historyPath, 'utf-8'), 'utf-8');
    expect(historySize).toBeLessThan(40 * 1024); // 40KB

    // After compaction, history shrinks dramatically
    const result = await compactAfterTestPass(TEST_DIR, 'small-scope');
    expect(result.compacted).toBe(true);

    const compactedSize = Buffer.byteLength(await readFile(historyPath, 'utf-8'), 'utf-8');
    expect(compactedSize).toBeLessThan(historySize);
    expect(compactedSize).toBeLessThan(1024); // tiny
  });

  it('large scope (50 files) defers 40 files and stays efficient', async () => {
    // Create 50 files
    for (let i = 0; i < 50; i++) {
      await writeFile(resolve(TEST_DIR, `src/large${i}.ts`), `// file ${i}`, 'utf-8');
    }

    const scopeFiles = Array.from({ length: 50 }, (_, i) => `src/large${i}.ts`);
    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles,
      mode: 'isolated',
    });

    // Eager load 10, defer 40
    expect(payload.fileCount).toBe(10);
    expect(payload.deferred).toHaveLength(40);

    // Total bytes loaded is small (10 files × ~10 bytes)
    expect(payload.totalBytes).toBeLessThan(1024); // well under 40KB
  });

  it('compaction after 50 iterations produces history smaller than threshold', async () => {
    const historyPath = resolve(TEST_DIR, '.codeconductor/history.jsonl');
    const entries: string[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push(JSON.stringify({
        taskId: 'long-running',
        phase: i % 2 === 0 ? 'RED' : 'GREEN',
        iteration: Math.floor(i / 2) + 1,
        timestamp: new Date().toISOString(),
        summary: `Iteration ${i}: ${i % 2 === 0 ? 'failing' : 'passing'} test`,
        errors: i % 2 === 0 ? [`ts-error-${i}`] : [],
      }));
    }
    await writeFile(historyPath, entries.join('\n') + '\n', 'utf-8');

    const beforeSize = Buffer.byteLength(await readFile(historyPath, 'utf-8'), 'utf-8');
    expect(beforeSize).toBeLessThan(40 * 1024); // 50 entries must fit under 40KB

    const result = await compactAfterTestPass(TEST_DIR, 'long-running');
    expect(result.compacted).toBe(true);
    expect(result.entriesRemoved).toBe(50);

    const afterSize = Buffer.byteLength(await readFile(historyPath, 'utf-8'), 'utf-8');
    // After compaction: 1 entry, well under 40KB
    expect(afterSize).toBeLessThan(40 * 1024);
    // And the size reduction must be significant (>10x smaller)
    expect(afterSize * 10).toBeLessThan(beforeSize);
  });

  it('token budget escalation triggers mid-run during 50-iteration scenario', async () => {
    // Simulate: 50 iterations possible, but budget runs out at iteration 10
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      return { tokenUsage: 60 }; // 60 tokens per call
    };
    // Budget = 500 → after ~9 calls (540 tokens) we exceed
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      errors: [{ file: 'x.ts', line: 1, code: 'E1', message: 'persistent', raw: 'x.ts(1): error E1' }],
      durationMs: 10,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 50,
      maxTokenBudget: 500,
    });

    expect(result.finalPhase).toBe('ESCALATED');
    // Should not reach 50 iterations — budget exhausted early
    expect(callCount).toBeLessThan(50);
    expect(callCount).toBeLessThanOrEqual(10); // ~9 calls of 60 = 540 > 500
  });

  it('unlimited budget allows full 50 iterations to complete', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      return { tokenUsage: 50 };
    };
    const compileCheckFn = async (): Promise<CompileResult> => {
      if (callCount < 50) {
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          errors: [{ file: 'x.ts', line: callCount, code: 'E1', message: `err ${callCount}`, raw: 'x.ts(1): error E1' }],
          durationMs: 10,
          timedOut: false,
        };
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', errors: [], durationMs: 10, timedOut: false };
    };

    const result = await runLoop(generateFn, compileCheckFn, {
      maxIterations: 50,
      maxTokenBudget: 0, // unlimited
    });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(50);
    expect(callCount).toBe(50);
  });
});
