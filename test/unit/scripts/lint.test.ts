import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintSourceTree } from '../../../scripts/lint';

describe('scripts/lint.ts', () => {
  test('passes a clean TypeScript file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cc-lint-ok-'));
    try {
      await writeFile(join(dir, 'ok.ts'), 'export const n: number = 1;\n');
      const issues = await lintSourceTree(dir);
      expect(issues).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('flags any, double casts, and nested imports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cc-lint-bad-'));
    try {
      await writeFile(
        join(dir, 'bad.ts'),
        [
          'export function f(x: any): void {',
          '  const y = x as unknown as string;',
          '  if (false) {',
          "    import { join } from 'node:path';",
          '    void join;',
          '  }',
          '}',
          '',
        ].join('\n'),
      );
      const issues = await lintSourceTree(dir);
      expect(issues.map((issue) => issue.rule).sort()).toEqual([
        'no-any',
        'no-as-unknown-as',
        'no-nested-import',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
