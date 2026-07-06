import { describe, expect, it } from 'bun:test';
import { runCompileCheck } from '../src/core/compilation/compile-checker';
import type { CompileResult } from '../src/core/compilation/compile-checker';
import { runLoop } from '../src/core/loop/loop-controller';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function okResult(overrides?: Partial<CompileResult>): CompileResult {
  return {
    success: true,
    exitCode: 0,
    stdout: '',
    stderr: '',
    errors: [],
    durationMs: 5,
    timedOut: false,
    ...overrides,
  };
}

function failResult(
  errors: CompileResult['errors'],
  overrides?: Partial<CompileResult>,
): CompileResult {
  return {
    success: false,
    exitCode: 1,
    stdout: '',
    stderr: '',
    errors,
    durationMs: 5,
    timedOut: false,
    ...overrides,
  };
}

const ERR_A = {
  file: 'src/index.ts',
  line: 10,
  column: 5,
  code: 'TS2322',
  message: "Type 'string' is not assignable to type 'number'.",
  raw: 'src/index.ts(10,5): error TS2322: Type mismatch',
};

const ERR_B = {
  file: 'src/app.ts',
  line: 3,
  code: 'TS7006',
  message: "Parameter 'x' implicitly has an 'any' type.",
  raw: 'src/app.ts(3): error TS7006: Parameter x implicitly has any type',
};

const ERR_C = {
  file: 'src/util.ts',
  line: 7,
  column: 2,
  code: 'TS2304',
  message: "Cannot find name 'foo'.",
  raw: 'src/util.ts(7,2): error TS2304: Cannot find name foo',
};

// ─── 1. Compile checker hangs → times out after timeoutMs ───────────────────

describe('compile checker timeout', () => {
  it('runCompileCheck times out when command hangs', async () => {
    const result = await runCompileCheck({
      command: 'sleep 30',
      timeoutMs: 50,
    });

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([]);
  });
});

// ─── 2. Always-failing compile → RUNNING→CHECKING→FEEDBACK ×3 → ESCALATED ─

describe('loop timeout — always-failing compile', () => {
  it('advances through RUNNING→CHECKING→FEEDBACK 3 times, then ESCALATED', async () => {
    // Use different errors each iteration to avoid stuck-loop detection
    // (identical consecutive errors trigger early ESCALATION)
    const errorsPerIteration = [[ERR_A], [ERR_B], [ERR_C]];
    let compileCount = 0;
    const generateFn = async () => {};
    const compileCheckFn = async (): Promise<CompileResult> => {
      const idx = Math.min(compileCount, 2);
      compileCount++;
      return failResult(errorsPerIteration[idx]!);
    };

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.finalPhase).toBe('ESCALATED');
    expect(result.escalationReport).toBeDefined();
    expect(result.escalationReport!.iterationsAttempted).toBe(3);
  });
});

// ─── 3. Compile succeeds on iteration 2 → DONE ──────────────────────────────

describe('loop timeout — compile succeeds on iteration 2', () => {
  it('DONE at iteration 2 after failure on iteration 1', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
    };
    const compileCheckFn = async (): Promise<CompileResult> => {
      if (callCount <= 1) {
        return failResult([ERR_A]);
      }
      return okResult();
    };

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);
    expect(result.finalPhase).toBe('DONE');
    expect(result.escalationReport).toBeUndefined();
  });
});

// ─── 4. EscalationReport contains all 3 iterations' errors ──────────────────

describe('loop timeout — escalation report completeness', () => {
  it('EscalationReport contains all 3 iterations errors', async () => {
    const errorsPerIteration = [[ERR_A], [ERR_B], [ERR_C]];
    let compileCount = 0;
    const generateFn = async () => {};
    const compileCheckFn = async (): Promise<CompileResult> => {
      const idx = Math.min(compileCount, 2);
      compileCount++;
      return failResult(errorsPerIteration[idx]!);
    };

    const result = await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });

    expect(result.finalPhase).toBe('ESCALATED');

    const report = result.escalationReport!;
    expect(report.errorHistory).toHaveLength(3);
    expect(report.iterationsAttempted).toBe(3);
    expect(report.attemptedFixes).toHaveLength(3);

    // Verify each iteration's errors are present
    expect(report.errorHistory[0]!).toHaveLength(1);
    expect(report.errorHistory[0]![0]!.code).toBe('TS2322');

    expect(report.errorHistory[1]!).toHaveLength(1);
    expect(report.errorHistory[1]![0]!.code).toBe('TS7006');

    expect(report.errorHistory[2]!).toHaveLength(1);
    expect(report.errorHistory[2]![0]!.code).toBe('TS2304');
  });
});

// ─── 5. ABORT action at any phase → immediate TERMINATE ──────────────────────

describe('loop timeout — ABORT at any phase', () => {
  it('ABORT from RUNNING via generateFn error → TERMINATE', async () => {
    const generateFn = async () => {
      throw new Error('abort-test');
    };
    const compileCheckFn = async (): Promise<CompileResult> => okResult();

    let threw = false;
    try {
      await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('ABORT from CHECKING via compileCheckFn error → immediate TERMINATE', async () => {
    const generateFn = async () => {};
    const compileCheckFn = async (): Promise<CompileResult> => {
      throw new Error('compile-abort');
    };

    let threw = false;
    try {
      await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('ABORT from FEEDBACK phase via generateFn error on retry → immediate TERMINATE', async () => {
    let callCount = 0;
    const generateFn = async () => {
      callCount++;
      if (callCount >= 2) {
        throw new Error('abort-in-feedback');
      }
    };
    const compileCheckFn = async (): Promise<CompileResult> => {
      return failResult([ERR_A]);
    };

    let threw = false;
    try {
      await runLoop(generateFn, compileCheckFn, { maxIterations: 3 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
