import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectStackVerifiers,
  listStackVerifiers,
  verifyWithStack,
} from '../../../../src/core/verification/stack-verifier';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stack-ver-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function linkLocalTsc(root: string): Promise<void> {
  const repo = process.cwd();
  await mkdir(join(root, 'node_modules', '.bin'), { recursive: true });
  await symlink(join(repo, 'node_modules', 'typescript'), join(root, 'node_modules', 'typescript'), 'dir');
  await symlink(
    join(repo, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(root, 'node_modules', '.bin', 'tsc'),
  );
}

describe('StackVerifier registry', () => {
  test('lists the typescript adapter', () => {
    expect(listStackVerifiers().map((v) => v.id)).toContain('typescript');
  });

  test('detects typescript when tsconfig.json is present', async () => {
    await writeFile(join(dir, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }\n');
    const found = await detectStackVerifiers(dir);
    expect(found.map((v) => v.id)).toEqual(['typescript']);
  });

  test('does not detect typescript without a tsconfig', async () => {
    expect(await detectStackVerifiers(dir)).toEqual([]);
  });

  test('verify returns unverified when tsc is missing', async () => {
    await writeFile(join(dir, 'tsconfig.json'), '{}\n');
    const result = await verifyWithStack('typescript', { root: dir, timeoutMs: 5_000 });
    expect(result.gateId).toBe('stack:typescript');
    expect(result.status).toBe('unverified');
    expect(result.violations).toEqual([]);
    expect(result.detail).toMatch(/not installed/i);
  });

  test('verify returns unverified for unknown stack ids', async () => {
    const result = await verifyWithStack('java', { root: dir });
    expect(result.status).toBe('unverified');
    expect(result.detail).toMatch(/Unknown stack verifier/);
  });

  test('verify passes a minimal well-typed project with local tsc', async () => {
    await writeFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
        include: ['index.ts'],
      }),
    );
    await writeFile(join(dir, 'index.ts'), 'export const x: number = 1;\n');
    await linkLocalTsc(dir);
    const result = await verifyWithStack('typescript', { root: dir, timeoutMs: 30_000 });
    expect(result.status).toBe('passed');
  });

  test('verify fails when the project has a type error', async () => {
    await writeFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
        include: ['bad.ts'],
      }),
    );
    await writeFile(join(dir, 'bad.ts'), 'export const x: number = "nope";\n');
    await linkLocalTsc(dir);
    const result = await verifyWithStack('typescript', { root: dir, timeoutMs: 30_000 });
    expect(result.status).toBe('failed');
    expect(result.violations.length).toBeGreaterThan(0);
  });
});
