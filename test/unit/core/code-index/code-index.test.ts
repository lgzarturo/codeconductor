import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../../src/cli/router';
import {
  buildCodeIndex,
  findSymbols,
  loadCodeIndex,
  saveCodeIndex,
  symbolsInFile,
} from '../../../../src/core/code-index/code-index';

const A_TS = `export function alpha(): number {
  return 1;
}

export class Gamma {
  run(): number {
    return 3;
  }
}
`;

const B_TS = `import { alpha } from './a';

export function alpha(): string {
  return 'shadow';
}

export const helper = (): number => 2;
`;

describe('core/code-index', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-index-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(dir, 'src', 'nested'), { recursive: true });
    await mkdir(join(dir, 'src', 'node_modules', 'fake'), { recursive: true });
    await writeFile(join(dir, 'src', 'a.ts'), A_TS);
    await writeFile(join(dir, 'src', 'nested', 'b.ts'), B_TS);
    await writeFile(join(dir, 'src', 'node_modules', 'fake', 'c.ts'), 'export function nope(): void {}\n');
    await writeFile(join(dir, 'src', 'readme.md'), '# docs\n');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('build indexes symbols with ranges, skipping noise', async () => {
    const built = await buildCodeIndex(dir);
    expect(built.success).toBe(true);
    if (!built.success) return;
    expect(Object.keys(built.data.files).sort()).toEqual(['src/a.ts', 'src/nested/b.ts']);
    expect(built.data.files['src/a.ts']).toEqual([
      { name: 'alpha', kind: 'function', startLine: 1, endLine: 3 },
      { name: 'Gamma', kind: 'class', startLine: 5, endLine: 9 },
    ]);
  });

  test('save/load round-trips; missing or stale index errors', async () => {
    expect((await loadCodeIndex(dir)).success).toBe(false);
    const built = await buildCodeIndex(dir);
    if (!built.success) return;
    expect((await saveCodeIndex(dir, built.data)).success).toBe(true);
    const loaded = await loadCodeIndex(dir);
    expect(loaded.success && loaded.data.files['src/a.ts']).toHaveLength(2);
    await writeFile(join(dir, '.codeconductor', 'code-index.json'), '{"version":999,"files":{}}');
    const stale = await loadCodeIndex(dir);
    expect(stale.success).toBe(false);
    expect(stale.success ? '' : stale.error.message).toMatch(/rebuild/i);
  });

  test('findSymbols matches by exact name across files', async () => {
    const built = await buildCodeIndex(dir);
    if (!built.success) return;
    const hits = findSymbols(built.data, 'alpha');
    expect(hits.map((h) => h.file).sort()).toEqual(['src/a.ts', 'src/nested/b.ts']);
    expect(findSymbols(built.data, 'missing')).toEqual([]);
  });

  test('symbolsInFile resolves known files and misses unknown ones', async () => {
    const built = await buildCodeIndex(dir);
    if (!built.success) return;
    expect(symbolsInFile(built.data, 'src/nested/b.ts').map((s) => s.name)).toEqual(['alpha', 'helper']);
    expect(symbolsInFile(built.data, 'src/nope.ts')).toEqual([]);
  });

  test('code-index build/find/file round-trips through the CLI', async () => {
    const route = (argv: string[]) => routeCommand(parseArgs(argv), dir);
    const build = await route(['code-index', 'build', '--output=json']);
    expect(build.code).toBe(0);
    expect(build.data).toMatchObject({ files: 2, symbols: 4 });
    const find = await route(['code-index', 'find', 'Gamma', '--output=json']);
    expect(find.data).toMatchObject({
      matches: [{ file: 'src/a.ts', name: 'Gamma', kind: 'class', startLine: 5, endLine: 9 }],
    });
    const file = await route(['code-index', 'file', 'src/nested/b.ts', '--output=json']);
    expect(file.code).toBe(0);
    expect((file.data as { symbols: unknown[] }).symbols).toHaveLength(2);
    const miss = await route(['code-index', 'find', 'missing', '--output=json']);
    expect(miss.code).toBe(0);
    expect(miss.data).toMatchObject({ matches: [] });
  });

  test('find without an index errors with a rebuild hint', async () => {
    const result = await routeCommand(parseArgs(['code-index', 'find', 'alpha']), dir);
    expect(result.code).toBe(1);
  });
});
