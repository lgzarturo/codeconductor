import { describe, expect, it } from 'bun:test';
import {
  formatFeedback,
  runLoop,
} from '../src/core/loop/loop-controller';
import type { CompileResult } from '../src/core/compilation/compile-checker';

// ─── formatFeedback ──────────────────────────────────────────────────────────

describe('formatFeedback', () => {
  it('returns empty string for no errors', () => {
    expect(formatFeedback([])).toBe('');
  });

  it('formats a single error', () => {
    const result = formatFeedback([
      {
        file: 'src/index.ts',
        line: 10,
        column: 5,
        code: 'TS2322',
        message: "Type 'string' is not assignable to type 'number'.",
        raw: 'src/index.ts(10,5): error TS2322: Type mismatch',
      },
    ]);

    expect(result).toContain('1 compilation error(s)');
    expect(result).toContain('src/index.ts:10:5');
    expect(result).toContain('[TS2322]');
    expect(result).toContain("Type 'string' is not assignable");
    expect(result).toContain('Generate corrected code');
  });

  it('formats multiple errors', () => {
    const result = formatFeedback([
      {
        file: 'src/a.ts',
        line: 1,
        code: 'TS2304',
        message: "Cannot find name 'foo'.",
        raw: 'src/a.ts(1): error TS2304',
      },
      {
        file: 'src/b.ts',
        line: 5,
        code: 'TS2345',
        message: 'Argument not assignable.',
        raw: 'src/b.ts(5): error TS2345',
      },
    ]);

    expect(result).toContain('2 compilation error(s)');
    expect(result).toContain('1. src/a.ts:1');
    expect(result).toContain('2. src/b.ts:5');
  });

  it('formats error without line/column', () => {
    const result = formatFeedback([
      {
        file: 'src/c.ts',
        code: 'TS9999',
        message: 'Generic error.',
        raw: 'src/c.ts: error TS9999: Generic error.',
      },
    ]);

    expect(result).toContain('src/c.ts');
    // Location should be just the file (no colon after file since no line)
    expect(result).toContain('1. src/c.ts [TS9999]');
  });
});

// ─── runLoop — success scenarios ─────────────────────────────────────────────

describe('runLoop', () => {
  it('successful compile on first try → DONE', async () => {
    const generateFn = async () => {};
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      errors: [],
      durationMs: 10,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.totalErrors).toBe(0);
    expect(result.finalPhase).toBe('DONE');
    expect(result.escalationReport).toBeUndefined();
  });

  it('failure then success → DONE', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
    };
    const compileCheckFn = async (): Promise<CompileResult> => {
      if (callCount <= 1) {
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          errors: [
            {
              file: 'src/index.ts',
              line: 10,
              code: 'TS2322',
              message: 'Type mismatch',
              raw: 'src/index.ts(10): error TS2322',
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

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);
    expect(result.totalErrors).toBe(1);
    expect(result.finalPhase).toBe('DONE');
  });

  it('3 failures → ESCALATED with report', async () => {
    const generateFn = async () => {};
    let compileCount = 0;
    const compileCheckFn = async (): Promise<CompileResult> => {
      compileCount++;
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        errors: [
          {
            file: `src/file${compileCount}.ts`,
            line: compileCount * 10,
            code: `TS2${String(compileCount).padStart(3, '0')}`,
            message: `Error on iteration ${compileCount}`,
            raw: `src/file${compileCount}.ts(${compileCount * 10}): error TS2${String(compileCount).padStart(3, '0')}`,
          },
        ],
        durationMs: 10,
        timedOut: false,
      };
    };

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.totalErrors).toBe(3);
    expect(result.finalPhase).toBe('ESCALATED');
    expect(result.escalationReport).toBeDefined();
    expect(result.escalationReport!.iterationsAttempted).toBe(3);
    expect(result.escalationReport!.attemptedFixes).toHaveLength(3);
    expect(result.escalationReport!.errorHistory).toHaveLength(3);
  });

  it('stuck loop (identical errors) → ESCALATED early', async () => {
    const generateFn = async () => {};
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      errors: [
        {
          file: 'src/index.ts',
          line: 10,
          code: 'TS2322',
          message: 'Type mismatch',
          raw: 'src/index.ts(10): error TS2322',
        },
      ],
      durationMs: 10,
      timedOut: false,
    });

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 5 });

    // Should escalate after 2 identical iterations, not wait for 5
    expect(result.success).toBe(false);
    expect(result.iterations).toBe(2);
    expect(result.finalPhase).toBe('ESCALATED');
    expect(result.escalationReport!.recommendedAction).toContain('identical');
  });

  it('aborts cleanly on generateFn error', async () => {
    const generateFn = async () => {
      throw new Error('generate failed');
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

    let threw = false;
    try {
      await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('passes feedback to generateFn on retry', async () => {
    let firstCallFeedback: string | undefined;
    let callCount = 0;

    const generateFn = async (feedback?: string) => {
      if (callCount === 0) {
        firstCallFeedback = feedback;
      }
      callCount++;
    };
    const compileCheckFn = async (): Promise<CompileResult> => {
      if (callCount <= 1) {
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          errors: [
            {
              file: 'src/index.ts',
              line: 5,
              code: 'TS2304',
              message: "Cannot find name 'foo'.",
              raw: 'src/index.ts(5): error TS2304',
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

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.success).toBe(true);
    // First call has no feedback, second call should have feedback
    expect(firstCallFeedback).toBeUndefined();
    expect(callCount).toBe(2);
  });
});

// ─── Escalation report details ───────────────────────────────────────────────

describe('runLoop — escalation report', () => {
  it('contains correct structure', async () => {
    const generateFn = async () => {};
    let compileCount = 0;
    const compileCheckFn = async (): Promise<CompileResult> => {
      compileCount++;
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        errors: [
          {
            file: `src/a${compileCount}.ts`,
            line: compileCount,
            code: `TS2${String(compileCount).padStart(3, '0')}`,
            message: `Error ${compileCount}`,
            raw: `src/a${compileCount}.ts(${compileCount}): error TS2${String(compileCount).padStart(3, '0')}`,
          },
        ],
        durationMs: 10,
        timedOut: false,
      };
    };

    const result = await runLoop(
      generateFn,
      compileCheckFn,
      { maxIterations: 3 },
      'my-task',
    );

    expect(result.escalationReport).toBeDefined();
    expect(result.escalationReport!.taskTitle).toBe('my-task');
    expect(result.escalationReport!.iterationsAttempted).toBe(3);
    expect(result.escalationReport!.attemptedFixes.length).toBeGreaterThan(0);
    expect(result.escalationReport!.recommendedAction).toBeTruthy();
    expect(result.escalationReport!.originalContext).toBeTruthy();
  });
});
