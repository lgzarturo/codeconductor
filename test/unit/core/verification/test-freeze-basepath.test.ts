import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freezeTestSuite, verifyTestFreeze } from '../../../../src/core/verification/test-freeze';

let dir: string;
let lockDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'freeze-base-'));
  lockDir = join(dir, '.lock');
  await mkdir(lockDir, { recursive: true });
  await mkdir(join(dir, 'tests'), { recursive: true });
  await writeFile(join(dir, 'tests/a.test.ts'), 'expect(1).toBe(1);\n');
  await writeFile(join(dir, 'bunfig.toml'), '[test]\n');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('freezeTestSuite with explicit basePath', () => {
  test('hashes directories and individual config files relative to basePath, not cwd', async () => {
    const manifest = await freezeTestSuite(['tests', 'bunfig.toml'], lockDir, dir);
    expect(manifest.files.map((f) => f.path)).toEqual(['bunfig.toml', 'tests/a.test.ts']);
    const ok = await verifyTestFreeze(join(lockDir, 'test-freeze.lock'), ['tests', 'bunfig.toml'], dir);
    expect(ok.valid).toBe(true);
  });

  test('detects a modified config file, a modified test and a deleted test', async () => {
    await freezeTestSuite(['tests', 'bunfig.toml'], lockDir, dir);
    await writeFile(join(dir, 'bunfig.toml'), '[test]\npreload = ["x"]\n');
    await rm(join(dir, 'tests/a.test.ts'));
    const bad = await verifyTestFreeze(join(lockDir, 'test-freeze.lock'), ['tests', 'bunfig.toml'], dir);
    expect(bad.valid).toBe(false);
    expect(bad.tamperedFiles).toEqual(['bunfig.toml', 'tests/a.test.ts']);
  });

  test('rejects a symlink inside the sealed set instead of following it', async () => {
    await symlink('/etc/hostname', join(dir, 'tests/link.test.ts'));
    await expect(freezeTestSuite(['tests'], lockDir, dir)).rejects.toThrow(/symlink/i);
  });

  test('a lock file with an invalid shape is rejected', async () => {
    await writeFile(join(lockDir, 'test-freeze.lock'), '{"hash":1}');
    await expect(verifyTestFreeze(join(lockDir, 'test-freeze.lock'), ['tests'], dir)).rejects.toThrow();
  });

  test('does not write the lock through a symlinked lock file', async () => {
    const victim = join(dir, 'victim.txt');
    await writeFile(victim, 'keep');
    await symlink(victim, join(lockDir, 'test-freeze.lock'));
    await expect(freezeTestSuite(['tests'], lockDir, dir)).rejects.toThrow();
    expect(await readFile(victim, 'utf-8')).toBe('keep');
  });
});
