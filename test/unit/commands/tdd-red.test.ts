import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../src/cli/router';
import { generateAdversarialSuite } from '../../../src/core/verification/adversarial-scaffold';
import { TechnicalPlanOutputSchema } from '../../../src/validation/schemas';

const MATRIX = [
  { scenario: 'empty array input', input: '[]', expected: 'empty result, no throw' },
  { scenario: "oversize 'quoted' input", input: '10MB string', expected: 'rejected' },
];

describe('tdd adversarial red', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-red-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('scaffold carries one strict failing case per edge with stable ids', () => {
    const suite = generateAdversarialSuite(MATRIX);
    expect(suite).toContain("test('E-001 empty array input'");
    expect(suite).toContain('// input: []');
    expect(suite).toContain('// expected: empty result, no throw');
    expect(suite).toContain("E-002 oversize \\'quoted\\' input");
    expect(suite).toContain('not wired');
  });

  test('generated scaffold actually runs red', async () => {
    await writeFile(join(dir, 'red.edge.test.ts'), generateAdversarialSuite(MATRIX));
    let code = 0;
    try {
      execFileSync('bun', ['test', 'red.edge.test.ts'], { cwd: dir, stdio: 'pipe' });
    } catch (e) {
      code = (e as { status?: number }).status ?? 1;
    }
    expect(code).not.toBe(0);
  });

  test('technical-plan contract requires a non-empty edge matrix', () => {
    const bare = TechnicalPlanOutputSchema.safeParse({
      approach: 'x',
      filesAffected: [],
      risks: [],
    });
    expect(bare.success).toBe(false);
    const withMatrix = TechnicalPlanOutputSchema.safeParse({
      approach: 'x',
      filesAffected: [],
      risks: [],
      edgeCases: [{ scenario: 's', input: 'i', expected: 'e' }],
    });
    expect(withMatrix.success).toBe(true);
  });

  test('tdd red writes the scaffold through the CLI', async () => {
    await writeFile(join(dir, 'matrix.json'), JSON.stringify(MATRIX));
    const result = await routeCommand(
      parseArgs(['tdd', 'red', '--matrix', '@matrix.json', '--out', 'red.edge.test.ts', '--output=json']),
      dir,
    );
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({ command: 'tdd red', cases: 2 });
    expect(await readFile(join(dir, 'red.edge.test.ts'), 'utf-8')).toContain('E-001');
  });

  test('tdd red rejects missing matrix, bad json and escaping outputs', async () => {
    expect((await routeCommand(parseArgs(['tdd', 'red']), dir)).code).toBe(1);
    await writeFile(join(dir, 'bad.json'), '{nope');
    expect(
      (await routeCommand(parseArgs(['tdd', 'red', '--matrix', '@bad.json', '--out', 'x.test.ts']), dir)).code,
    ).toBe(1);
    await writeFile(join(dir, 'matrix.json'), JSON.stringify(MATRIX));
    expect(
      (await routeCommand(parseArgs(['tdd', 'red', '--matrix', '@matrix.json', '--out', '../escape.test.ts']), dir)).code,
    ).toBe(1);
  });
});
