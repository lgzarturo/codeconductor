import { expect, test, describe, beforeAll, afterAll, mock } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkScopeCompliance } from '../src/core/verification/scope-guard';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('scope-guard', () => {
  const testDir = join(process.cwd(), 'tmp-scope-guard');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: testDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: testDir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: testDir });
    
    await writeFile(join(testDir, 'file1.ts'), 'content');
    await writeFile(join(testDir, 'file2.ts'), 'content');
    await writeFile(join(testDir, 'package.json'), '{}');
    
    await execFileAsync('git', ['add', '.'], { cwd: testDir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: testDir });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('No changed files -> passes', async () => {
    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['file1.ts'],
      baseBranch: 'HEAD'
    });
    
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('All changed files in scope -> passes', async () => {
    await writeFile(join(testDir, 'file1.ts'), 'modified');
    await execFileAsync('git', ['add', 'file1.ts'], { cwd: testDir });
    await execFileAsync('git', ['commit', '-m', 'mod1'], { cwd: testDir });

    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['file1.ts'],
      baseBranch: 'HEAD~1'
    });
    
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('Changed file outside scope -> violation', async () => {
    await writeFile(join(testDir, 'file2.ts'), 'modified');
    await execFileAsync('git', ['add', 'file2.ts'], { cwd: testDir });
    await execFileAsync('git', ['commit', '-m', 'mod2'], { cwd: testDir });

    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['file1.ts'],
      baseBranch: 'HEAD~1' // file2.ts changed
    });
    
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].file).toBe('file2.ts');
  });

  test('Allowlisted file outside scope -> passes', async () => {
    await writeFile(join(testDir, 'package.json'), '{"mod":true}');
    await execFileAsync('git', ['add', 'package.json'], { cwd: testDir });
    await execFileAsync('git', ['commit', '-m', 'mod-pkg'], { cwd: testDir });

    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['file1.ts'],
      allowlist: ['package.json'],
      baseBranch: 'HEAD~1'
    });
    
    expect(result.passed).toBe(true);
  });

  test('Multiple violations reported correctly', async () => {
    await writeFile(join(testDir, 'file1.ts'), 'modified again');
    await writeFile(join(testDir, 'untracked1.ts'), 'new');
    await writeFile(join(testDir, 'untracked2.ts'), 'new');
    await execFileAsync('git', ['add', '.'], { cwd: testDir });
    await execFileAsync('git', ['commit', '-m', 'multiple'], { cwd: testDir });

    const result = await checkScopeCompliance({
      cwd: testDir,
      allowedFiles: ['file1.ts'],
      baseBranch: 'HEAD~1'
    });
    
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(2);
    const violationFiles = result.violations.map(v => v.file).sort();
    expect(violationFiles).toEqual(['untracked1.ts', 'untracked2.ts'].sort());
  });

  test('Git failure is handled gracefully', async () => {
    const result = await checkScopeCompliance({
      cwd: '/path/does/not/exist/or/no/git',
      allowedFiles: [],
      baseBranch: 'HEAD~1'
    });
    
    expect(result.passed).toBe(true); // Returns empty changes
    expect(result.checkedFiles).toHaveLength(0);
  });
});
