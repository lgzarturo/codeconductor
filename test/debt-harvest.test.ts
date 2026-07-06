import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { debtHarvestCommand } from '../src/commands/debt-harvest.command';

const FIXTURE_DIR = join(import.meta.dir, 'fixtures', 'debt-harvest');
const TMP_DIR = join(import.meta.dir, 'fixtures', 'debt-harvest-tmp');

describe('debtHarvestCommand', () => {
  beforeEach(async () => {
    await mkdir(join(TMP_DIR, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  test('finds defer comments and writes ledger', async () => {
    // Create a test file with defer comments
    await writeFile(
      join(TMP_DIR, 'src', 'test.ts'),
      `function foo() {
  // defer - implement caching
  return bar();
}

function baz() {
  // defer: add error handling --robustness
  return qux();
}
`,
    );

    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'human',
    });

    expect(result.code).toBe(0);
    expect(result.data).toBeDefined();
    const data = result.data as { success: boolean; entries: unknown[]; message: string };
    expect(data.success).toBe(true);
    expect(data.entries).toHaveLength(2);
    expect(data.message).toContain('2 deferred item(s)');
  });

  test('skips files without defer comments', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'clean.ts'),
      `function foo() {
  return bar();
}
`,
    );

    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'human',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; entries: unknown[] };
    expect(data.success).toBe(true);
    expect(data.entries).toHaveLength(0);
  });

  test('parses --tag from defer comments', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'tagged.ts'),
      `// defer - optimize query --perf
const x = 1;
// defer - add validation
const y = 2;
`,
    );

    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; entries: Array<{ reason: string; tag?: string }> };
    expect(data.success).toBe(true);
    expect(data.entries).toHaveLength(2);

    const perfEntry = data.entries.find((e) => e.tag === 'perf');
    expect(perfEntry).toBeDefined();
    expect(perfEntry!.reason).toBe('optimize query');

    const untaggedEntry = data.entries.find((e) => !e.tag);
    expect(untaggedEntry).toBeDefined();
  });

  test('handles missing directory gracefully', async () => {
    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'nonexistent',
      output: 'human',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; entries: unknown[] };
    expect(data.success).toBe(true);
    expect(data.entries).toHaveLength(0);
  });

  test('writes ledger with managed block markers', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'marker.ts'),
      `// defer - test marker --test
const x = 1;
`,
    );

    await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'human',
    });

    const { readFile } = await import('node:fs/promises');
    const ledger = await readFile(join(TMP_DIR, '.codeconductor', 'debt-ledger.md'), 'utf-8');
    expect(ledger).toContain('<!-- CODECONDUCTOR:BEGIN managed -->');
    expect(ledger).toContain('<!-- CODECONDUCTOR:END managed -->');
    expect(ledger).toContain('## test');
    expect(ledger).toContain('test marker');
  });

  test('reads from fixture directory', async () => {
    const result = await debtHarvestCommand({
      projectRoot: FIXTURE_DIR,
      dir: 'src',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; entries: Array<{ file: string; line: number; reason: string; tag?: string }> };
    expect(data.success).toBe(true);
    // fixture/src/sample.ts has 4 defer comments, fixture/src/utils.py has 1
    expect(data.entries.length).toBeGreaterThanOrEqual(5);

    // Check that file paths are relative
    for (const entry of data.entries) {
      expect(entry.file).toMatch(/^src\//);
    }
  });
});
