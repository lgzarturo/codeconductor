import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkScopeCompliance } from '../src/core/verification/scope-guard';

const execFileAsync = promisify(execFile);

const INITIAL = `export function alpha(): number {
  return 1;
}

export function beta(): number {
  return 2;
}
`;

describe('scope-guard symbol impact', () => {
  const testDir = join(process.cwd(), 'tmp-scope-guard-symbols');

  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: testDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: testDir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: testDir });
    await writeFile(join(testDir, 'a.ts'), INITIAL);
    await writeFile(join(testDir, 'b.ts'), 'export const other = 1;\n');
    await execFileAsync('git', ['add', '.'], { cwd: testDir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: testDir });
    // Worktree-only change: touch beta, leave alpha alone.
    await writeFile(
      join(testDir, 'a.ts'),
      INITIAL.replace('return 2;', 'return 20;'),
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('RED: touched symbol outside allowedSymbols is a violation', async () => {
    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['a.ts'],
      allowedSymbols: { 'a.ts': ['alpha'] },
      baseBranch: 'HEAD',
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.file).toBe('a.ts');
    expect(result.violations[0]!.reason).toContain('beta');
  });

  test('satisfied allowedSymbols passes and reports affected symbols', async () => {
    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['a.ts'],
      allowedSymbols: { 'a.ts': ['alpha', 'beta'] },
      baseBranch: 'HEAD',
    });

    expect(result.passed).toBe(true);
    expect(result.affectedSymbols.map((s) => s.name)).toContain('beta');
    expect(result.affectedSymbols.map((s) => s.name)).not.toContain('alpha');
  });

  test('out-of-scope file reason names the touched symbols', async () => {
    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['b.ts'],
      baseBranch: 'HEAD',
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.file).toBe('a.ts');
    expect(result.violations[0]!.reason).toContain('beta');
    expect(result.violations[0]!.symbols).toContain('beta');
  });

  test('no allowedSymbols keeps file-level behavior', async () => {
    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['a.ts'],
      baseBranch: 'HEAD',
    });

    expect(result.passed).toBe(true);
    expect(result.affectedSymbols).toHaveLength(1);
  });
});
