import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSymbolMap, findCollisions } from '../../../../src/core/verification/harness/symbol-map';

let dir: string;
let mapPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harness-map-'));
  mapPath = join(dir, 'SYMBOL_MAP.json');
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, 'test'), { recursive: true });
  await mkdir(join(dir, 'node_modules/x'), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  await writeFile(join(dir, rel), content, 'utf-8');
}

describe('buildSymbolMap', () => {
  test('extracts exported public contracts without bodies or private members', async () => {
    await write(
      'src/pricing.ts',
      [
        '/** Calculates totals. */',
        'export class PriceCalculator {',
        '  total(items: number[], tax?: number): number { return 1; }',
        '  private secret(): void {}',
        '}',
        'export function applyDiscount(price: number, pct: number): number { return price; }',
        'export interface Money { amount: number }',
        'export type Currency = "EUR" | "USD";',
        'function hidden() {}',
      ].join('\n'),
    );
    const { map } = await buildSymbolMap(dir, mapPath);
    const mod = map.modules['src/pricing.ts'];
    const names = mod?.symbols.map((s) => s.name).sort();
    expect(names).toEqual(['Currency', 'Money', 'PriceCalculator', 'applyDiscount']);
    const fn = mod?.symbols.find((s) => s.name === 'applyDiscount');
    expect(fn?.kind).toBe('function');
    expect(fn?.signature).toBe('(price: number, pct: number): number');
    const cls = mod?.symbols.find((s) => s.name === 'PriceCalculator');
    expect(cls?.members).toEqual(['total(items: number[], tax?: number): number']);
    expect(JSON.stringify(map)).not.toContain('return 1');
  });

  test('indexes classes with constructors, accessors, index signatures and static blocks', async () => {
    await write(
      'src/shapes.ts',
      [
        'export class A {',
        '  constructor(private x: number, public y: string) {}',
        '  [k: string]: unknown;',
        '  static { A.count = 1; }',
        '  static count = 0;',
        '  get v(): number { return 1; }',
        '  #hidden = 1;',
        '  m(): void {}',
        '}',
      ].join('\n'),
    );
    const { map } = await buildSymbolMap(dir, mapPath);
    const cls = map.modules['src/shapes.ts']?.symbols[0];
    expect(cls?.name).toBe('A');
    expect(cls?.members).toContain('m(): void');
    expect(cls?.members?.some((m) => m.includes('hidden'))).toBe(false);
  });

  test('ignores node_modules and test directories', async () => {
    await write('node_modules/x/lib.ts', 'export class Hidden {}\n');
    await write('test/a.test.ts', 'export class TestOnly {}\n');
    await write('src/a.ts', 'export class Visible {}\n');
    const { map } = await buildSymbolMap(dir, mapPath);
    expect(Object.keys(map.modules)).toEqual(['src/a.ts']);
  });

  test('does not index a symlinked source file that points outside the root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'harness-map-outside-'));
    try {
      await writeFile(join(outside, 'secret.ts'), 'export class Leaked {}\n');
      await symlink(join(outside, 'secret.ts'), join(dir, 'src/link.ts'));
      const { map } = await buildSymbolMap(dir, mapPath);
      expect(Object.keys(map.modules)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test('is incremental: unchanged files are reused, changed files are re-parsed', async () => {
    await write('src/a.ts', 'export class A {}\n');
    await write('src/b.ts', 'export class B {}\n');
    const first = await buildSymbolMap(dir, mapPath);
    expect(first.parsed).toBe(2);
    expect(first.reused).toBe(0);

    await write('src/b.ts', 'export class B {}\nexport class C {}\n');
    const second = await buildSymbolMap(dir, mapPath);
    expect(second.reused).toBe(1);
    expect(second.parsed).toBe(1);
    expect(second.map.modules['src/b.ts']?.symbols.map((s) => s.name)).toEqual(['B', 'C']);
  });

  test('writes the map to disk as JSON with a base commit marker', async () => {
    await write('src/a.ts', 'export class A {}\n');
    await buildSymbolMap(dir, mapPath);
    const onDisk = JSON.parse(await readFile(mapPath, 'utf-8'));
    expect(typeof onDisk.baseCommitSha).toBe('string');
    expect(onDisk.modules['src/a.ts'].symbols[0].name).toBe('A');
  });
});

describe('findCollisions', () => {
  test('reports a class already defined in another module', async () => {
    await write('src/pricing.ts', 'export class PriceCalculator {}\n');
    await buildSymbolMap(dir, mapPath);
    await write('src/new-stub.ts', 'export class PriceCalculator {}\n');
    const c = await findCollisions(mapPath, [join(dir, 'src/new-stub.ts')], dir);
    expect(c).toEqual([
      { name: 'PriceCalculator', stubFile: 'src/new-stub.ts', existingFile: 'src/pricing.ts' },
    ]);
  });

  test('does not report a symbol redefined in its own module', async () => {
    await write('src/pricing.ts', 'export class PriceCalculator {}\n');
    await buildSymbolMap(dir, mapPath);
    expect(await findCollisions(mapPath, [join(dir, 'src/pricing.ts')], dir)).toEqual([]);
  });

  test('ignores short generic function names but flags long domain function names', async () => {
    await write('src/util.ts', 'export function run() {}\nexport function applyLoyaltyDiscount() {}\n');
    await buildSymbolMap(dir, mapPath);
    await write('src/stub.ts', 'export function run() {}\nexport function applyLoyaltyDiscount() {}\n');
    const c = await findCollisions(mapPath, [join(dir, 'src/stub.ts')], dir);
    expect(c.map((x) => x.name)).toEqual(['applyLoyaltyDiscount']);
  });

  test('reports a collision even when the symbol is defined in several modules', async () => {
    await write('src/a.ts', 'export interface Options { a: 1 }\n');
    await write('src/b.ts', 'export interface Options { b: 1 }\n');
    await buildSymbolMap(dir, mapPath);
    await write('src/c.ts', 'export interface Options {}\n');
    const c = await findCollisions(mapPath, [join(dir, 'src/b.ts')], dir);
    expect(c.map((x) => x.existingFile)).toEqual(['src/a.ts']);
  });

  test('returns no collisions when the map does not exist', async () => {
    await write('src/stub.ts', 'export class X {}\n');
    expect(await findCollisions(join(dir, 'missing.json'), [join(dir, 'src/stub.ts')], dir)).toEqual([]);
  });
});
