import { describe, expect, test } from 'bun:test';
import {
  runLoop,
  skippedCompileResult,
} from '../../../../src/core/loop/loop-engine';
import type { CompileResult } from '../../../../src/core/compilation/compile-checker';

describe('compile check skip reporting', () => {
  test('skippedCompileResult marks compileCheck skipped with a reason', () => {
    const result = skippedCompileResult('not on the compile allowlist');
    expect(result.skipped).toBe(true);
    expect(result.success).toBe(true);
    expect(result.skipReason).toBe('not on the compile allowlist');
    expect(result.stderr).toContain('compileCheck: skipped');
  });

  test('runLoop surfaces compileCheck skipped on the loop result', async () => {
    const compileCheckFn = async (): Promise<CompileResult> =>
      skippedCompileResult('command is not on the compile allowlist');
    const result = await runLoop(async () => undefined, compileCheckFn, {
      maxIterations: 1,
    });
    expect(result.compileCheck).toBe('skipped');
    expect(result.compileCheckSkipReason).toBe(
      'command is not on the compile allowlist',
    );
  });

  test('runLoop reports compileCheck ran when the check executed', async () => {
    const compileCheckFn = async (): Promise<CompileResult> => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      errors: [],
      durationMs: 1,
      timedOut: false,
    });
    const result = await runLoop(async () => undefined, compileCheckFn, {
      maxIterations: 1,
    });
    expect(result.compileCheck).toBe('ran');
    expect(result.compileCheckSkipReason).toBeUndefined();
  });
});
