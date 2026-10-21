import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  detectChanges,
  findSymbolsInSource,
  parseDiffRanges,
} from '../../../../src/core/impact/detect-changes';

const BASE_A = `export function alpha(): number {
  return 1;
}

export function beta(): number {
  return 2;
}

export class Gamma {
  run(): number {
    return 3;
  }
}
`;

describe('core/impact/detect-changes — pure units', () => {
  test('parseDiffRanges extracts new-side line ranges per file', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,4 @@',
      ' ctx',
      '-old',
      '+new1',
      '+new2',
      ' ctx2',
      '@@ -10 +12,0 @@',
      '-gone',
    ].join('\n');
    expect(parseDiffRanges(diff)).toEqual([
      { file: 'src/a.ts', startLine: 1, endLine: 4 },
      { file: 'src/a.ts', startLine: 12, endLine: 11 },
    ]);
  });

  test('parseDiffRanges tracks deleted files with no new-side range', () => {
    const diff = [
      'diff --git a/old.ts b/old.ts',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-a',
      '-b',
    ].join('\n');
    expect(parseDiffRanges(diff)).toEqual([{ file: 'old.ts', startLine: 0, endLine: -1 }]);
  });

  test('findSymbolsInSource maps top-level symbols to line ranges', () => {
    const symbols = findSymbolsInSource(BASE_A);
    expect(symbols).toEqual([
      { name: 'alpha', kind: 'function', startLine: 1, endLine: 3 },
      { name: 'beta', kind: 'function', startLine: 5, endLine: 7 },
      { name: 'Gamma', kind: 'class', startLine: 9, endLine: 13 },
    ]);
  });

  test('findSymbolsInSource covers interface, type and const bindings', () => {
    const src = [
      'export interface Shape {',
      '  side: number;',
      '}',
      'export type Id = string;',
      'export const make = (): number => 1;',
      'const helper = () => {',
      '  return 2;',
      '};',
    ].join('\n');
    expect(findSymbolsInSource(src)).toEqual([
      { name: 'Shape', kind: 'interface', startLine: 1, endLine: 3 },
      { name: 'Id', kind: 'type', startLine: 4, endLine: 4 },
      { name: 'make', kind: 'const', startLine: 5, endLine: 5 },
      { name: 'helper', kind: 'const', startLine: 6, endLine: 8 },
    ]);
  });
});

describe('core/impact/detect-changes — git fixture', () => {
  let repo: string;

  function git(cmd: string): string {
    return execSync(`git ${cmd}`, { cwd: repo, encoding: 'utf8' });
  }

  beforeEach(async () => {
    repo = resolve(tmpdir(), `cc-detect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(repo, 'src'), { recursive: true });
    execSync('git init', { cwd: repo });
    execSync('git config user.email "test@example.com"', { cwd: repo });
    execSync('git config user.name "Test User"', { cwd: repo });
    await writeFile(join(repo, 'src', 'a.ts'), BASE_A);
    await writeFile(join(repo, 'notes.md'), '# notes\n');
    git('add -A');
    git('commit -qm base');
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  test('reports affected files and only the overlapping symbols', async () => {
    const path = join(repo, 'src', 'a.ts');
    const content = await readFile(path, 'utf-8');
    await writeFile(path, content.replace('return 1;', 'return 10;'));
    const result = await detectChanges(repo);
    expect(result.affectedFiles).toEqual(['src/a.ts']);
    expect(result.affectedSymbols).toEqual([
      { file: 'src/a.ts', name: 'alpha', kind: 'function', startLine: 1, endLine: 3 },
    ]);
  });

  test('deletion-only hunks attribute to the enclosing symbol', async () => {
    const path = join(repo, 'src', 'a.ts');
    const content = await readFile(path, 'utf-8');
    await writeFile(path, content.replace('  return 2;\n', ''));
    const result = await detectChanges(repo);
    expect(result.affectedFiles).toEqual(['src/a.ts']);
    expect(result.affectedSymbols.map((s) => s.name)).toEqual(['beta']);
  });

  test('new staged files mark every top-level symbol affected', async () => {
    await writeFile(join(repo, 'src', 'b.ts'), 'export function fresh(): boolean {\n  return true;\n}\n');
    git('add src/b.ts');
    const result = await detectChanges(repo);
    expect(result.affectedFiles).toEqual(['src/b.ts']);
    expect(result.affectedSymbols).toEqual([
      { file: 'src/b.ts', name: 'fresh', kind: 'function', startLine: 1, endLine: 3 },
    ]);
  });

  test('non-TS files land in affectedFiles with no symbols', async () => {
    await writeFile(join(repo, 'notes.md'), '# notes\n\nmore\n');
    const result = await detectChanges(repo);
    expect(result.affectedFiles).toEqual(['notes.md']);
    expect(result.affectedSymbols).toEqual([]);
  });

  test('clean tree yields empty result', async () => {
    expect(await detectChanges(repo)).toEqual({ affectedFiles: [], affectedSymbols: [] });
  });

  test('non-git directory yields empty result without throwing', async () => {
    const plain = join(tmpdir(), `cc-plain-${Date.now()}`);
    await mkdir(plain, { recursive: true });
    try {
      expect(await detectChanges(plain)).toEqual({ affectedFiles: [], affectedSymbols: [] });
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});
