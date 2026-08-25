import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isAllowlistedCompileCommand,
  parseCompileErrors,
  runCompileCheck,
} from '../src/core/compilation/compile-checker';

// ─── parseCompileErrors tests ────────────────────────────────────────────────

describe('parseCompileErrors', () => {
  it('parses TypeScript errors', () => {
    const stderr = `src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/app.ts(3,1): error TS7006: Parameter 'x' implicitly has an 'any' type.`;

    const errors = parseCompileErrors(stderr);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: 'src/index.ts',
      line: 10,
      column: 5,
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'.",
      raw: errors[0].raw,
    });
    expect(errors[1]).toEqual({
      file: 'src/app.ts',
      line: 3,
      column: 1,
      code: 'TS7006',
      message: "Parameter 'x' implicitly has an 'any' type.",
      raw: errors[1].raw,
    });
  });

  it('parses TypeScript error without column', () => {
    const stderr = `src/index.ts(10): error TS2322: Type 'string' is not assignable.`;

    const errors = parseCompileErrors(stderr);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('src/index.ts');
    expect(errors[0].line).toBe(10);
    expect(errors[0].column).toBeUndefined();
  });

  it('parses ESLint errors with severity', () => {
    // Real ESLint format: file:line:col: message  severity  rule-id
    const stderr = `src/index.ts:10:5: 'unused' is defined but never used  error  no-unused-vars
src/app.ts:3:1: Unexpected any  warning  @typescript-eslint/no-explicit-any`;

    const errors = parseCompileErrors(stderr);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: 'src/index.ts',
      line: 10,
      column: 5,
      code: 'no-unused-vars',
      message: "'unused' is defined but never used",
      raw: errors[0].raw,
    });
    expect(errors[1]).toEqual({
      file: 'src/app.ts',
      line: 3,
      column: 1,
      code: '@typescript-eslint/no-explicit-any',
      message: 'Unexpected any',
      raw: errors[1].raw,
    });
  });

  it('parses generic path:line:col: message format', () => {
    const stderr = `src/util.py:42:10: unexpected indent`;

    const errors = parseCompileErrors(stderr);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: 'src/util.py',
      line: 42,
      column: 10,
      code: '',
      message: 'unexpected indent',
      raw: errors[0].raw,
    });
  });

  it('parses generic path: line: message format', () => {
    const stderr = `src/util.rs: 55: cannot borrow as mutable`;

    const errors = parseCompileErrors(stderr);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('src/util.rs');
    expect(errors[0].line).toBe(55);
    expect(errors[0].message).toBe('cannot borrow as mutable');
  });

  it('returns empty array for empty stderr', () => {
    expect(parseCompileErrors('')).toEqual([]);
    expect(parseCompileErrors('   ')).toEqual([]);
  });

  it('returns empty array for non-parseable output', () => {
    const stderr = 'Compiling project...\nDone.';
    expect(parseCompileErrors(stderr)).toEqual([]);
  });

  it('handles multiple error formats in one output', () => {
    // When TS errors are found, only TS errors returned (first match wins)
    const stderr = `src/index.ts(1,1): error TS2304: Cannot find name 'foo'.
src/app.ts:5:1: some other text`;

    const errors = parseCompileErrors(stderr);
    // Only TS errors are returned since they are found first
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('TS2304');
  });
});

describe('isAllowlistedCompileCommand', () => {
  it('accepts trusted compile argv prefixes', () => {
    expect(isAllowlistedCompileCommand('tsc --noEmit')).toBe(true);
    expect(isAllowlistedCompileCommand('bun run typecheck')).toBe(true);
    expect(isAllowlistedCompileCommand('npm test')).toBe(true);
    expect(isAllowlistedCompileCommand('npm run build')).toBe(true);
  });

  it('rejects untrusted or path-qualified binaries', () => {
    expect(isAllowlistedCompileCommand('node -e "process.exit(0)"')).toBe(false);
    expect(isAllowlistedCompileCommand('./tsc --noEmit')).toBe(false);
    expect(isAllowlistedCompileCommand('/usr/bin/tsc --noEmit')).toBe(false);
    expect(isAllowlistedCompileCommand('bun')).toBe(false);
    expect(isAllowlistedCompileCommand('curl https://evil.example')).toBe(false);
  });
});

// ─── runCompileCheck tests ──────────────────────────────────────────────────

describe('runCompileCheck', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cc-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns success for a valid command', async () => {
    const result = await runCompileCheck({
      command: 'echo hello',
      cwd: testDir,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.stderr).toBe('');
    expect(result.errors).toEqual([]);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns failure for a failing command', async () => {
    const result = await runCompileCheck({
      command: 'node -e process.exit(1)',
      cwd: testDir,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('handles command not found gracefully', async () => {
    const result = await runCompileCheck({
      command: 'nonexistent-command-xyz',
      cwd: testDir,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(-1);
  });

  it('times out when command takes too long', async () => {
    const result = await runCompileCheck({
      command: 'sleep 10',
      cwd: testDir,
      timeoutMs: 100,
    });

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  }, 5000);

  it('captures stderr on failure via temp script', async () => {
    const scriptPath = join(testDir, 'fail.mjs');
    await writeFile(
      scriptPath,
      'console.error("test error"); process.exit(1);'
    );

    const result = await runCompileCheck({
      command: `node ${scriptPath}`,
      cwd: testDir,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('test error');
    // Unstructured error text is captured in stderr but not parsed into errors
    expect(result.errors).toEqual([]);
  });

  it('parses TS errors from command output', async () => {
    const scriptPath = join(testDir, 'ts-fail.mjs');
    await writeFile(
      scriptPath,
      'console.error("src/index.ts(10,5): error TS2322: Type mismatch"); process.exit(1);'
    );

    const result = await runCompileCheck({
      command: `node ${scriptPath}`,
      cwd: testDir,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('TS2322');
  });

  it('kills descendants when a compile check times out', async () => {
    const sentinel = join(testDir, 'descendant-survived.txt');
    const childPath = join(testDir, 'descendant.mjs');
    const parentPath = join(testDir, 'parent.mjs');
    await writeFile(
      childPath,
      `import { writeFile } from 'node:fs/promises';
await new Promise((resolve) => setTimeout(resolve, 400));
await writeFile(${JSON.stringify(sentinel)}, 'survived');`,
    );
    await writeFile(
      parentPath,
      `import { spawn } from 'node:child_process';
spawn(process.execPath, [${JSON.stringify(childPath)}], { stdio: 'ignore' });
await new Promise(() => {});`,
    );

    const result = await runCompileCheck({
      command: [process.execPath, parentPath],
      cwd: testDir,
      timeoutMs: 80,
    });
    expect(result.timedOut).toBe(true);

    await Bun.sleep(600);
    expect(await Bun.file(sentinel).exists()).toBe(false);
  }, 5000);
});
