import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const routerPath = join(dirname(fileURLToPath(import.meta.url)), '../src/cli/router.ts');

describe('CLI router lazy command loading', () => {
  test('command handlers are loaded with await import, not eager value imports', async () => {
    const src = await readFile(routerPath, 'utf-8');
    const valueImports = src
      .split('\n')
      .filter((line) => /^import \{/.test(line) && !line.includes('import type'));
    expect(valueImports.join('\n')).not.toMatch(/Command/);
    expect(src).toMatch(/await import\('\.\.\/commands\/init\.command'\)/);
    expect(src).toMatch(/await import\('\.\.\/commands\/seo-audit\.command'\)/);
  });
});
