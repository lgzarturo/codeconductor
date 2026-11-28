import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkProductionFiles,
  checkTestFiles,
  collectProductionMetrics,
  collectProductionMetricsFromText,
  countAssertions,
} from '../../../../src/core/verification/harness/gatekeeper';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harness-gate-'));
  await mkdir(join(dir, 'src/core'), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<string> {
  const path = join(dir, rel);
  await writeFile(path, content, 'utf-8');
  return path;
}

describe('checkProductionFiles', () => {
  test('accepts a function with exactly 4 parameters', async () => {
    const f = await write('ok.ts', 'export function f(a: number, b: number, c: number, d: number) { return a + b + c + d; }\n');
    expect(await checkProductionFiles([f])).toEqual([]);
  });

  test('rejects 5 parameters, counting optional, rest and destructured ones', async () => {
    const f = await write(
      'many.ts',
      'export function f(a: number, b?: number, { c }: { c: number } = { c: 1 }, d = 4, ...rest: number[]) { return a; }\n',
    );
    const violations = await checkProductionFiles([f]);
    expect(violations.map((v) => v.rule)).toEqual(['max-params']);
    expect(violations[0]?.line).toBe(1);
  });

  test('does not count the `this` pseudo-parameter', async () => {
    const f = await write('this.ts', 'export function f(this: object, a: number, b: number, c: number, d: number) { return a; }\n');
    expect(await checkProductionFiles([f])).toEqual([]);
  });

  test('rejects methods and arrow functions over the parameter limit', async () => {
    const f = await write(
      'kinds.ts',
      'export class A { m(a: 1, b: 1, c: 1, d: 1, e: 1) {} }\nexport const g = (a: 1, b: 1, c: 1, d: 1, e: 1) => a;\n',
    );
    expect((await checkProductionFiles([f])).map((v) => v.rule)).toEqual(['max-params', 'max-params']);
  });

  test('rejects files over 250 lines and accepts exactly 250', async () => {
    const ok = await write('ok250.ts', 'export const x = 1;\n'.repeat(250));
    const big = await write('big251.ts', 'export const x = 1;\n'.repeat(251));
    expect(await checkProductionFiles([ok])).toEqual([]);
    expect((await checkProductionFiles([big])).map((v) => v.rule)).toEqual(['max-lines']);
  });

  test('cyclomatic complexity 10 passes, 11 fails', async () => {
    const branches = (n: number) =>
      `export function f(x: number) {\n${Array.from({ length: n }, (_, i) => `  if (x === ${i}) return ${i};`).join('\n')}\n  return -1;\n}\n`;
    const ok = await write('c10.ts', branches(9));
    const bad = await write('c11.ts', branches(10));
    expect(await checkProductionFiles([ok])).toEqual([]);
    expect((await checkProductionFiles([bad])).map((v) => v.rule)).toEqual(['max-complexity']);
  });

  test('logical operators, ternaries and nullish coalescing add complexity', async () => {
    const f = await write(
      'logic.ts',
      'export function f(a: boolean, b: boolean, c?: number) {\n  return (a && b) || (a ? 1 : 2) || (c ?? 3) || (b && a) || (a || b) || (a ? b : a) || (a && a) || (b && b) || (c ?? 1);\n}\n',
    );
    expect((await checkProductionFiles([f])).map((v) => v.rule)).toEqual(['max-complexity']);
  });

  test('honours custom limits', async () => {
    const f = await write('lim.ts', 'export function f(a: number, b: number) { return a + b; }\n');
    const v = await checkProductionFiles([f], { maxParams: 1 });
    expect(v.map((x) => x.rule)).toEqual(['max-params']);
  });
});

describe('checkProductionFiles regression mode', () => {
  const branches = (n: number) =>
    `export function f(x: number) {\n${Array.from({ length: n }, (_, i) => `  if (x === ${i}) return ${i};`).join('\n')}\n  return -1;\n}\n`;

  test('improvement below absolute ceiling still passes (15→12 with max 10)', async () => {
    const baselineText = branches(14); // complexity 15
    const currentText = branches(11); // complexity 12
    const f = await write('improve.ts', currentText);
    const baseline = new Map([[f, collectProductionMetricsFromText(f, baselineText)]]);
    expect(await checkProductionFiles([f], {}, { mode: 'regression', baseline })).toEqual([]);
  });

  test('worsening complexity fails even when absolute mode would also fail', async () => {
    const baselineText = branches(11); // complexity 12
    const currentText = branches(12); // complexity 13
    const f = await write('worse.ts', currentText);
    const baseline = new Map([[f, collectProductionMetricsFromText(f, baselineText)]]);
    const v = await checkProductionFiles([f], {}, { mode: 'regression', baseline });
    const complexity = v.filter((x) => x.rule === 'max-complexity');
    expect(complexity).toHaveLength(1);
    expect(complexity[0]?.message).toMatch(/regression/);
  });

  test('new over-limit function without baseline still fails absolute ceiling', async () => {
    const f = await write('newfn.ts', branches(10)); // complexity 11
    const empty = new Map<string, ReturnType<typeof collectProductionMetricsFromText>>();
    const v = await checkProductionFiles([f], {}, { mode: 'regression', baseline: empty });
    expect(v.map((x) => x.rule)).toEqual(['max-complexity']);
    expect(v[0]?.message).not.toMatch(/regression/);
  });

  test('line-count regression only fires when the file grows', async () => {
    const baselineText = 'export const x = 1;\n'.repeat(260);
    const shrunk = 'export const x = 1;\n'.repeat(255);
    const grown = 'export const x = 1;\n'.repeat(270);
    const f = await write('lines.ts', shrunk);
    const baseline = new Map([[f, collectProductionMetricsFromText(f, baselineText)]]);
    expect(await checkProductionFiles([f], {}, { mode: 'regression', baseline })).toEqual([]);
    await writeFile(f, grown, 'utf-8');
    const v = await checkProductionFiles([f], {}, { mode: 'regression', baseline });
    expect(v.map((x) => x.rule)).toEqual(['max-lines']);
  });

  test('collectProductionMetrics mirrors check inputs', async () => {
    const f = await write('m.ts', 'export function f(a: number) { return a; }\n');
    const map = await collectProductionMetrics([f]);
    expect(map.get(f)?.functions[0]?.name).toBe('f');
    expect(map.get(f)?.functions[0]?.params).toBe(1);
  });
});

describe('checkTestFiles', () => {
  const DOMAIN = ['src/core/**'];

  test('rejects mock.module on a domain module', async () => {
    const f = await write(
      'a.test.ts',
      "import { mock } from 'bun:test';\nmock.module('./src/core/pricing', () => ({}));\n",
    );
    const v = await checkTestFiles([f], DOMAIN, dir);
    expect(v.map((x) => x.rule)).toEqual(['no-internal-mock']);
  });

  test('rejects spyOn on an object imported from the domain', async () => {
    const f = await write(
      'b.test.ts',
      "import { spyOn } from 'bun:test';\nimport * as pricing from './src/core/pricing';\nspyOn(pricing, 'total');\n",
    );
    const v = await checkTestFiles([f], DOMAIN, dir);
    expect(v.map((x) => x.rule)).toEqual(['no-internal-mock']);
  });

  test('allows mocking an external boundary and plain fakes', async () => {
    const f = await write(
      'c.test.ts',
      "import { mock } from 'bun:test';\nmock.module('node:fs', () => ({}));\nconst fake = { fetch: async () => 1 };\n",
    );
    expect(await checkTestFiles([f], DOMAIN, dir)).toEqual([]);
  });
});

describe('gatekeeper evasion resistance', () => {
  const DOMAIN = ['src/core/**'];
  const rules = async (name: string, src: string) =>
    (await checkTestFiles([await write(name, src)], DOMAIN, dir)).map((x) => x.rule);

  test('catches aliased mock, template-literal specifier and doMock variants', async () => {
    expect(await rules('a1.test.ts', "import { mock as m } from 'bun:test';\nm.module('./src/core/svc', () => ({}));\n")).toEqual(['no-internal-mock']);
    expect(await rules('a2.test.ts', 'mock.module(`./src/core/svc`, () => ({}));\n')).toEqual(['no-internal-mock']);
    expect(await rules('a3.test.ts', "vi.doMock('./src/core/svc');\n")).toEqual(['no-internal-mock']);
  });

  test('catches spyOn on a prototype or on an instance of a domain class', async () => {
    const head = "import { spyOn } from 'bun:test';\nimport { Svc } from './src/core/svc';\n";
    expect(await rules('b1.test.ts', `${head}spyOn(Svc.prototype, 'go');\n`)).toEqual(['no-internal-mock']);
    expect(await rules('b2.test.ts', `${head}const s = new Svc();\nspyOn(s, 'go');\n`)).toEqual(['no-internal-mock']);
  });

  test('matches domain globs that include a file extension', async () => {
    const v = await checkTestFiles([await write('c.test.ts', "mock.module('./src/core/svc', () => ({}));\n")], ['src/core/**/*.ts'], dir);
    expect(v).toHaveLength(1);
  });

  test('measures getters and compound logical assignments', async () => {
    const ifs = Array.from({ length: 10 }, (_, i) => `if (this.x === ${i}) return ${i};`).join(' ');
    const getter = await write('g.ts', `export class A { x = 1; get v() { ${ifs} return 0; } }\n`);
    expect((await checkProductionFiles([getter])).map((v) => v.rule)).toEqual(['max-complexity']);
    const ops = Array.from({ length: 10 }, () => 'a ||= b; b &&= a; a ??= b;').join(' ');
    const assign = await write('h.ts', `export function f(a: any, b: any) { ${ops} }\n`);
    expect((await checkProductionFiles([assign])).map((v) => v.rule)).toEqual(['max-complexity']);
  });

  test('a bare expect(x) without a matcher is not an assertion', async () => {
    const f = await write('i.test.ts', "expect(1);\nexpect(2).not.toBe(3);\n");
    expect(await countAssertions(f)).toBe(1);
  });

  test('counts expect.soft, expect.poll and casted expects', async () => {
    const f = await write(
      'j.test.ts',
      "expect.soft(1).toBe(1);\nexpect.poll(() => 1).toBe(1);\n(expect(2) as any).toBe(2);\nexpect(3)!.toBe;\n",
    );
    expect(await countAssertions(f)).toBe(3);
  });
});

describe('countAssertions', () => {
  test('counts only expect(...) calls, not assert nor expect.assertions', async () => {
    const f = await write(
      'd.test.ts',
      "import { expect, test } from 'bun:test';\ntest('x', () => {\n  expect.assertions(2);\n  expect(1).toBe(1);\n  expect(2).toBe(2);\n  assert.equal(1, 1);\n});\n",
    );
    expect(await countAssertions(f)).toBe(2);
  });

  test('returns 0 for a test without expect', async () => {
    const f = await write('e.test.ts', "import { test } from 'bun:test';\ntest('x', () => {});\n");
    expect(await countAssertions(f)).toBe(0);
  });
});
