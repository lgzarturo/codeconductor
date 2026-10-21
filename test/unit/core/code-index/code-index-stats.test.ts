import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../../src/cli/router';
import {
  buildCodeIndex,
  measureCodeIndex,
  saveCodeIndex,
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

describe('core/code-index stats', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-index-stats-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'a.ts'), A_TS);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('RED: measureCodeIndex reports size, counts and timings', async () => {
    const built = await buildCodeIndex(dir);
    expect(built.success).toBe(true);
    if (!built.success) return;
    expect((await saveCodeIndex(dir, built.data)).success).toBe(true);

    const stats = await measureCodeIndex(dir);
    expect(stats.success).toBe(true);
    if (!stats.success) return;
    expect(stats.data.files).toBe(1);
    expect(stats.data.symbols).toBe(2);
    expect(stats.data.bytes).toBeGreaterThan(0);
    expect(stats.data.loadMs).toBeGreaterThanOrEqual(0);
    expect(stats.data.findMs).toBeGreaterThanOrEqual(0);
    expect(stats.data.topFiles).toEqual([{ file: 'src/a.ts', symbols: 2 }]);
  });

  test('measureCodeIndex errors with a rebuild hint when the index is missing', async () => {
    const stats = await measureCodeIndex(dir);
    expect(stats.success).toBe(false);
    if (stats.success) return;
    expect(stats.error.message).toContain('code-index build');
  });

  test('code-index stats round-trips through the CLI and build reports size/time', async () => {
    const route = (argv: string[]) => routeCommand(parseArgs(argv), dir);
    const build = await route(['code-index', 'build', '--output=json']);
    expect(build.code).toBe(0);
    expect(build.data).toMatchObject({ files: 1, symbols: 2 });
    expect((build.data as { bytes: number }).bytes).toBeGreaterThan(0);
    expect((build.data as { buildMs: number }).buildMs).toBeGreaterThanOrEqual(0);
    const stats = await route(['code-index', 'stats', '--output=json']);
    expect(stats.code).toBe(0);
    expect(stats.data).toMatchObject({ files: 1, symbols: 2 });
  });
});
