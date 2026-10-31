import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, routeCommand } from '../../../src/cli/router';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harness-cmd-'));
  await mkdir(join(dir, 'src/core'), { recursive: true });
  await mkdir(join(dir, 'tests'), { recursive: true });
  await writeFile(join(dir, 'tests/a.test.ts'), "expect(1).toBe(1);\n");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const run = (...argv: string[]) => routeCommand(parseArgs(['harness', ...argv, '--output=json']), dir);

describe('harness subcommands', () => {
  test('seal then verify-seal succeed, and verify-seal fails (exit 1) after tampering', async () => {
    const sealed = await run('seal', '--paths', 'tests');
    expect(sealed.code).toBe(0);
    expect((await run('verify-seal', '--paths', 'tests')).code).toBe(0);
    await writeFile(join(dir, 'tests/a.test.ts'), "expect(2).toBe(2);\n");
    const bad = await run('verify-seal', '--paths', 'tests');
    expect(bad.code).toBe(1);
    expect(JSON.stringify(bad.data)).toContain('tests/a.test.ts');
  });

  test('check-code exits 1 with violations for an over-limit file and 0 for a clean one', async () => {
    await writeFile(join(dir, 'src/core/bad.ts'), 'export function f(a: 1, b: 1, c: 1, d: 1, e: 1) {}\n');
    await writeFile(join(dir, 'src/core/good.ts'), 'export function g(a: 1) { return a; }\n');
    const bad = await run('check-code', '--paths', 'src/core/bad.ts');
    expect(bad.code).toBe(1);
    expect(JSON.stringify(bad.data)).toContain('max-params');
    expect((await run('check-code', '--paths', 'src/core/good.ts')).code).toBe(0);
  });

  test('check-tests flags mocks of the default domain src/core/**', async () => {
    await writeFile(join(dir, 'tests/m.test.ts'), "mock.module('../src/core/x', () => ({}));\nexpect(1).toBe(1);\n");
    expect((await run('check-tests', '--paths', 'tests/m.test.ts')).code).toBe(1);
    expect((await run('check-tests', '--paths', 'tests/a.test.ts')).code).toBe(0);
  });

  test('index writes SYMBOL_MAP.json and collisions reports duplicates with exit 1', async () => {
    await writeFile(join(dir, 'src/core/pricing.ts'), 'export class PriceCalculator {}\n');
    const idx = await run('index', '--out', 'SYMBOL_MAP.json');
    expect(idx.code).toBe(0);
    expect(JSON.parse(await readFile(join(dir, 'SYMBOL_MAP.json'), 'utf-8')).modules['src/core/pricing.ts']).toBeDefined();
    await writeFile(join(dir, 'src/core/dup.ts'), 'export class PriceCalculator {}\n');
    const col = await run('collisions', '--map', 'SYMBOL_MAP.json', '--paths', 'src/core/dup.ts');
    expect(col.code).toBe(1);
    expect(JSON.stringify(col.data)).toContain('PriceCalculator');
  });

  test('rejects paths that escape the project root', async () => {
    expect((await run('check-code', '--paths', '../outside.ts')).code).toBe(1);
  });

  test('unknown subcommand fails with usage', async () => {
    expect((await run('nope')).code).toBe(1);
  });

  test('seal refuses to overwrite an existing lock unless --force', async () => {
    expect((await run('seal', '--paths', 'tests')).code).toBe(0);
    expect((await run('seal', '--paths', 'tests')).code).toBe(1);
    expect((await run('seal', '--paths', 'tests', '--force')).code).toBe(0);
  });

  test('seal fails on a sealed path that does not exist', async () => {
    expect((await run('seal', '--paths', 'tests,typo-dir')).code).toBe(1);
  });

  test('verify-seal --expected-hash anchors the seal outside the lock file', async () => {
    const sealed = await run('seal', '--paths', 'tests');
    const hash = (sealed.data as { hash: string }).hash;
    expect((await run('verify-seal', '--paths', 'tests', '--expected-hash', hash)).code).toBe(0);
    await writeFile(join(dir, 'tests/a.test.ts'), 'expect(9).toBe(9);\n');
    await run('seal', '--paths', 'tests', '--force');
    expect((await run('verify-seal', '--paths', 'tests')).code).toBe(0);
    expect((await run('verify-seal', '--paths', 'tests', '--expected-hash', hash)).code).toBe(1);
  });
});

describe('harness containment', () => {
  let outside: string;

  beforeEach(async () => {
    outside = await mkdtemp(join(tmpdir(), 'harness-outside-'));
  });

  afterEach(async () => {
    await rm(outside, { recursive: true, force: true });
  });

  test('a .harness symlink pointing outside the project is not written through', async () => {
    await symlink(outside, join(dir, '.harness'));
    expect((await run('seal', '--paths', 'tests')).code).toBe(1);
    expect(await readdir(outside)).toEqual([]);
  });

  test('--lock-dir cannot target .git', async () => {
    await mkdir(join(dir, '.git/hooks'), { recursive: true });
    expect((await run('seal', '--paths', 'tests', '--lock-dir', '.git/hooks')).code).toBe(1);
    expect(await readdir(join(dir, '.git/hooks'))).toEqual([]);
  });

  test('index refuses --out inside .git and a symlinked SYMBOL_MAP.json', async () => {
    await mkdir(join(dir, '.git'), { recursive: true });
    expect((await run('index', '--out', '.git/config')).code).toBe(1);
    const victim = join(outside, 'victim.txt');
    await writeFile(victim, 'keep');
    await symlink(victim, join(dir, 'SYMBOL_MAP.json'));
    expect((await run('index')).code).toBe(1);
    expect(await readFile(victim, 'utf-8')).toBe('keep');
  });

  test('check-code refuses a path that is a symlink to a file outside the project', async () => {
    const evil = join(outside, 'evil.ts');
    await writeFile(evil, 'export const x = 1;\n');
    await symlink(evil, join(dir, 'src/core/link.ts'));
    expect((await run('check-code', '--paths', 'src/core/link.ts')).code).toBe(1);
  });
});
