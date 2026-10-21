import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../src/cli/router';
import { assembleContext } from '../../src/core/ccep/context-assembly';
import { injectScopeAwareContext } from '../../src/core/context/context-injector';
import { resolveScopeFiles } from '../../src/core/code-index/code-index';
import { buildCodeIndex, saveCodeIndex } from '../../src/core/code-index/code-index';

describe('scoped micro-context', () => {
  test('assembly keeps global and in-scope fragments, required always wins', () => {
    const assembly = assembleContext(
      [
        { source: 'rules', content: 'r' },
        { source: 'scope', id: 'in', content: 'a', files: ['src/api/a.ts'] },
        { source: 'scope', id: 'out', content: 'b', files: ['src/auth/x.ts'] },
        { source: 'evidence', id: 'req', content: 'c', files: ['elsewhere.ts'], required: true },
      ],
      1000,
      { scopeFiles: ['src/api'] },
    );
    expect(assembly.fragments.map((f) => f.id ?? f.source)).toEqual(['rules', 'in', 'req']);
    expect(assembly.omittedSources).toEqual(['scope']);
  });

  test('assembly without scope behaves as before', () => {
    const assembly = assembleContext(
      [{ source: 'scope', content: 'a', files: ['src/api/a.ts'] }],
      1000,
    );
    expect(assembly.fragments).toHaveLength(1);
  });
});

describe('scope-aware injection via code index', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-micro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(dir, 'src', 'api'), { recursive: true });
    await mkdir(join(dir, 'src', 'auth'), { recursive: true });
    await writeFile(join(dir, 'src', 'api', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(dir, 'src', 'auth', 'x.ts'), 'export const x = 2;\n');
    const built = await buildCodeIndex(dir);
    if (!built.success) throw new Error('fixture index build failed');
    await saveCodeIndex(dir, built.data);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('resolveScopeFiles expands prefixes and honors exclusions', async () => {
    expect((await resolveScopeFiles(dir, { in: ['src/api'] })).data).toEqual(['src/api/a.ts']);
    expect((await resolveScopeFiles(dir, { in: ['src'], out: ['auth'] })).data).toEqual([
      'src/api/a.ts',
    ]);
    expect((await resolveScopeFiles(dir, { in: [] })).data).toEqual([]);
  });

  test('resolveScopeFiles without an index points at build', async () => {
    await rm(join(dir, '.codeconductor', 'code-index.json'), { force: true });
    const result = await resolveScopeFiles(dir, { in: ['src'] });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.message).toMatch(/build/);
  });

  test('injectScopeAwareContext loads only in-scope contents', async () => {
    const payload = await injectScopeAwareContext(dir, { in: ['src/api'] });
    expect(Object.keys(payload.files)).toEqual(['src/api/a.ts']);
    expect(payload.truncated).toBe(false);
  });

  test('injectScopeAwareContext respects the byte budget', async () => {
    const payload = await injectScopeAwareContext(
      dir,
      { in: ['src'] },
      { maxContextBytes: 10 },
    );
    expect(payload.truncated).toBe(true);
    expect(payload.fileCount).toBe(0);
  });

  test('ccep context serves the scoped payload', async () => {
    const json = await routeCommand(
      parseArgs(['ccep', 'context', '--scope', 'src/api', '--output=json']),
      dir,
    );
    expect(json.code).toBe(0);
    expect(json.data).toMatchObject({ command: 'ccep context', fileCount: 1 });
    expect(Object.keys((json.data as { files: Record<string, string> }).files)).toEqual([
      'src/api/a.ts',
    ]);
    const human = await routeCommand(parseArgs(['ccep', 'context', '--scope', 'src/api']), dir);
    expect(human.code).toBe(0);
    expect((human.data as { output: string }).output).toContain('src/api/a.ts');
  });

  test('ccep context requires --scope', async () => {
    const result = await routeCommand(parseArgs(['ccep', 'context']), dir);
    expect(result.code).toBe(1);
  });
});
