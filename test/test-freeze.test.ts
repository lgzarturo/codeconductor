import { expect, test, describe, beforeAll, afterAll } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { freezeTestSuite, verifyTestFreeze, readFreezeLock } from '../src/core/verification/test-freeze';

describe('test-freeze', () => {
  const testDir = join(process.cwd(), 'tmp-test-freeze');
  const lockPath = join(testDir, 'test-freeze.lock');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('Freezing an empty directory produces a valid manifest', async () => {
    const emptyDir = join(testDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    
    const manifest = await freezeTestSuite([emptyDir], testDir);
    expect(manifest).toBeDefined();
    expect(manifest.files).toEqual([]);
    expect(manifest.hash).toBeDefined();
    
    const verifyResult = await verifyTestFreeze(lockPath, [emptyDir], process.cwd());
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.tamperedFiles).toEqual([]);
  });

  test('Freezing a directory with files produces correct per-file hashes', async () => {
    const srcDir = join(testDir, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'a.txt'), 'hello');
    await writeFile(join(srcDir, 'b.txt'), 'world');

    const manifest = await freezeTestSuite([srcDir], testDir);
    expect(manifest.files.length).toBe(2);
    expect(manifest.files[0].path).toContain('a.txt');
    expect(manifest.files[1].path).toContain('b.txt');
  });

  test('Verification passes when files are unchanged', async () => {
    const srcDir = join(testDir, 'src2');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'a.txt'), 'hello');

    await freezeTestSuite([srcDir], testDir);
    const verifyResult = await verifyTestFreeze(lockPath, [srcDir], process.cwd());
    
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.tamperedFiles.length).toBe(0);
  });

  test('Verification fails when a file is modified', async () => {
    const srcDir = join(testDir, 'src3');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'a.txt'), 'hello');

    await freezeTestSuite([srcDir], testDir);
    
    await writeFile(join(srcDir, 'a.txt'), 'hello world');
    
    const verifyResult = await verifyTestFreeze(lockPath, [srcDir], process.cwd());
    
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.tamperedFiles.length).toBe(1);
    expect(verifyResult.tamperedFiles[0]).toContain('a.txt');
  });

  test('Verification identifies the specific tampered file', async () => {
    const srcDir = join(testDir, 'src4');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'a.txt'), 'hello');
    await writeFile(join(srcDir, 'b.txt'), 'world');

    await freezeTestSuite([srcDir], testDir);
    
    await writeFile(join(srcDir, 'b.txt'), 'world modified');
    
    const verifyResult = await verifyTestFreeze(lockPath, [srcDir], process.cwd());
    
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.tamperedFiles).toHaveLength(1);
    expect(verifyResult.tamperedFiles[0]).toContain('b.txt');
  });

  test('readFreezeLock returns null for missing lock file', async () => {
    const missingLock = join(testDir, 'missing.lock');
    const result = await readFreezeLock(missingLock);
    expect(result).toBeNull();
  });

  test('Aggregate hash is deterministic', async () => {
    const srcDir = join(testDir, 'src5');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'z.txt'), 'z');
    await writeFile(join(srcDir, 'a.txt'), 'a');

    const manifest1 = await freezeTestSuite([srcDir], testDir);
    
    // the files should be sorted by relative path in the manifest
    expect(manifest1.files[0].path).toContain('a.txt');
    expect(manifest1.files[1].path).toContain('z.txt');
    
    // Simulate re-running
    const manifest2 = await freezeTestSuite([srcDir], testDir);
    expect(manifest1.hash).toEqual(manifest2.hash);
  });
});
