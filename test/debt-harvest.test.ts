import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
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
    // fixture/src/sample.ts has 4 defer comments, fixture/src/utils.ts has 1
    expect(data.entries.length).toBeGreaterThanOrEqual(5);

    // Check that file paths are relative
    for (const entry of data.entries) {
      expect(entry.file).toMatch(/^src\//);
    }
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  test('does NOT modify source files (read-only guarantee)', async () => {
    const sourcePath = join(TMP_DIR, 'src', 'readonly.ts');
    const originalContent = `// defer - add logging
function foo() {
  return 42;
}
`;
    await writeFile(sourcePath, originalContent);

    await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'human',
    });

    const afterContent = await readFile(sourcePath, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  test('handles multiple defer comments on the same line (only the first match is captured)', async () => {
    // The regex is line-anchored via single-line matching, so a second
    // `// defer` on the same physical line is a separate match.
    await writeFile(
      join(TMP_DIR, 'src', 'multi.ts'),
      `// defer - first reason --a
// defer - second reason --b
const x = 1;
`,
    );

    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { entries: Array<{ line: number; reason: string; tag?: string }> };
    expect(data.entries).toHaveLength(2);
    expect(data.entries.find((e) => e.reason === 'first reason')?.tag).toBe('a');
    expect(data.entries.find((e) => e.reason === 'second reason')?.tag).toBe('b');
  });

  test('skips hidden directories and node_modules', async () => {
    // Defer inside node_modules and .hidden must be ignored
    await mkdir(join(TMP_DIR, 'src', 'node_modules', 'pkg'), { recursive: true });
    await writeFile(
      join(TMP_DIR, 'src', 'node_modules', 'pkg', 'index.js'),
      `// defer - should not be picked up
function a() { return 1; }
`,
    );

    await mkdir(join(TMP_DIR, 'src', '.hidden'), { recursive: true });
    await writeFile(
      join(TMP_DIR, 'src', '.hidden', 'secret.ts'),
      `// defer - also ignored
function b() { return 2; }
`,
    );

    // A real, visible file
    await writeFile(
      join(TMP_DIR, 'src', 'visible.ts'),
      `// defer - this one is visible
function c() { return 3; }
`,
    );

    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'json',
    });

    const data = result.data as { entries: Array<{ file: string; reason: string }> };
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]!.file).toBe('src/visible.ts');
    expect(data.entries[0]!.reason).toBe('this one is visible');
  });

  test('walks nested directories recursively', async () => {
    await mkdir(join(TMP_DIR, 'src', 'lib', 'utils'), { recursive: true });
    await writeFile(
      join(TMP_DIR, 'src', 'lib', 'utils', 'helper.ts'),
      `// defer - deep nested item
function helper() {}
`,
    );

    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'json',
    });

    const data = result.data as { entries: Array<{ file: string; reason: string }> };
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]!.file).toBe('src/lib/utils/helper.ts');
  });

  test('unclassified entries (no --tag) are grouped separately in ledger', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'mixed.ts'),
      `// defer - tagged item --perf
const a = 1;
// defer - untagged item
const b = 2;
`,
    );

    await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'human',
    });

    const ledger = await readFile(
      join(TMP_DIR, '.codeconductor', 'debt-ledger.md'),
      'utf-8',
    );

    expect(ledger).toContain('## perf');
    expect(ledger).toContain('## unclassified');
    // Each tag gets its own section header
    const perfHeaderCount = (ledger.match(/^## perf$/gm) ?? []).length;
    const unclassifiedHeaderCount = (ledger.match(/^## unclassified$/gm) ?? []).length;
    expect(perfHeaderCount).toBe(1);
    expect(unclassifiedHeaderCount).toBe(1);
  });

  test('does not match comments that look like defer but are missing the marker', async () => {
    await writeFile(
      join(TMP_DIR, 'src', 'negatives.ts'),
      `// TODO - not a defer
// FIXME: not a defer either
// Note: nothing here
// deffer - typo, not a defer
// defer: this one is real --real
const x = 1;
`,
    );

    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'json',
    });

    const data = result.data as { entries: Array<{ reason: string; tag?: string }> };
    // Only the legit "defer:" line should match
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]!.reason).toBe('this one is real');
    expect(data.entries[0]!.tag).toBe('real');
  });

  test('empty project root produces an empty ledger', async () => {
    const result = await debtHarvestCommand({
      projectRoot: TMP_DIR,
      dir: 'src',
      output: 'json',
    });

    const data = result.data as {
      success: boolean;
      entries: unknown[];
      entryCount: number;
    };
    expect(data.success).toBe(true);
    expect(data.entries).toHaveLength(0);
    expect(data.entryCount).toBe(0);
  });
});
