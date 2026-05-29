import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');

describe('npm package bin', () => {
  test('CLI entrypoint declares a Node shebang', async () => {
    const entrypoint = await readFile(resolve(PROJECT_ROOT, 'src', 'cli', 'main.ts'), 'utf-8');

    expect(entrypoint.startsWith('#!/usr/bin/env node\n')).toBe(true);
  });

  test('package bin exposes cc-codeconductor and legacy codeconductor commands', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(PROJECT_ROOT, 'package.json'), 'utf-8')
    ) as { bin?: Record<string, string> };

    expect(packageJson.bin?.['cc-codeconductor']).toBe('./dist/index.js');
    expect(packageJson.bin?.codeconductor).toBe('./dist/index.js');
  });
});
