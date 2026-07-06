import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CredentialGuardError } from '../src/cli/errors';
import { loadCredentialPatterns } from '../src/core/filesystem/credential-guard';
import {
  isProtectedPath,
  scanForCredentials,
} from '../src/core/filesystem/safety';
import { writeGeneratedFiles } from '../src/core/filesystem/file-writer';
import { createGeneratedFile } from '../src/core/generation/generated-file';

const TEST_DIR = join(import.meta.dir, '..', '.test-boundary-security');

async function cleanup() {
  await rm(TEST_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_DIR, { recursive: true });
});

describe('Boundary Security — credential content detection', () => {
  test('password=supersecret is detected by scanForCredentials()', async () => {
    const patterns = await loadCredentialPatterns();
    const matches = scanForCredentials('test.ts', 'password=supersecret', patterns);
    expect(matches.length).toBe(1);
    expect(matches[0].matched).toContain('password=supersecret');
  });

  test('api_key: "sk-proj-abc123" is detected', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'api_key: "sk-proj-abc123"';
    const matches = scanForCredentials('config.ts', content, patterns);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].matched).toContain('api_key');
  });

  test('token = ghp_xxxxxxxxxxxx is detected', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'token = ghp_xxxxxxxxxxxx';
    const matches = scanForCredentials('auth.ts', content, patterns);
    expect(matches.length).toBe(1);
    expect(matches[0].matched).toContain('token');
  });

  test('secret=longvalue is detected', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'secret=wJalrXUtnFEMI';
    const matches = scanForCredentials('env.ts', content, patterns);
    expect(matches.length).toBe(1);
    expect(matches[0].matched).toContain('secret=wJalrXUtnFEMI');
  });
});

describe('Boundary Security — protected path blocking', () => {
  test('.env path is protected and write is rejected', async () => {
    expect(isProtectedPath('.env')).toBe(true);

    const files = [
      createGeneratedFile(join(TEST_DIR, '.env'), 'DB_HOST=localhost'),
    ];

    const results = await writeGeneratedFiles(files, { force: false, dryRun: false });

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Protected path');
    await expect(readFile(join(TEST_DIR, '.env'), 'utf-8')).rejects.toThrow();
  });

  test('.aws/credentials path is protected and write is rejected', async () => {
    expect(isProtectedPath('.aws/credentials')).toBe(true);

    const files = [
      createGeneratedFile(
        join(TEST_DIR, '.aws', 'credentials'),
        '[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE'
      ),
    ];

    const results = await writeGeneratedFiles(files, { force: false, dryRun: false });

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Protected path');
    await expect(
      readFile(join(TEST_DIR, '.aws', 'credentials'), 'utf-8')
    ).rejects.toThrow();
  });
});

describe('Boundary Security — batch rejection', () => {
  test('batch of 3 files where 2nd has credential → entire batch rejected', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'file1.txt'), 'Safe content one'),
      createGeneratedFile(join(TEST_DIR, 'file2.txt'), 'token=ghp_xxxxxxxxxxxx'),
      createGeneratedFile(join(TEST_DIR, 'file3.txt'), 'Safe content three'),
    ];

    await expect(
      writeGeneratedFiles(files, { force: false, dryRun: false })
    ).rejects.toThrow(CredentialGuardError);

    // None of the 3 files should exist
    await expect(readFile(join(TEST_DIR, 'file1.txt'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(TEST_DIR, 'file2.txt'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(TEST_DIR, 'file3.txt'), 'utf-8')).rejects.toThrow();
  });
});

describe('Boundary Security — force flag does not bypass credentials', () => {
  test('--force does NOT bypass credential blocking', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'forced.txt'), 'secret=mysecretvalue123456'),
    ];

    await expect(
      writeGeneratedFiles(files, { force: true, dryRun: false })
    ).rejects.toThrow(CredentialGuardError);

    await expect(readFile(join(TEST_DIR, 'forced.txt'), 'utf-8')).rejects.toThrow();
  });
});
