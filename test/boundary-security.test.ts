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

// Synthetic values with valid provider shapes. None are real credentials.
const AWS_ACCESS_KEY_ID = 'AKIADF5QFN6FEW8NR2ZB';
const AWS_SECRET_VALUE = 'iWKREwR1EHN1cd8EjxuH4BtVjwXs6kDaA7GYTJgF';
const GITHUB_CLASSIC_PAT = 'ghp_SjFfZ22D3xmS8Okei21GhbjxE5u3QwbcySbM';

async function cleanup() {
  await rm(TEST_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_DIR, { recursive: true });
});

describe('Boundary Security — credential content detection', () => {
  test('AWS access key id is detected by scanForCredentials()', async () => {
    const patterns = await loadCredentialPatterns();
    const matches = scanForCredentials('test.ts', `key=${AWS_ACCESS_KEY_ID}`, patterns);
    expect(matches.length).toBe(1);
    expect(matches[0].pattern).toBe('aws-access-key-id');
    expect(matches[0].matched).toBe('[REDACTED]');
  });

  test('AWS_SECRET_ACCESS_KEY assignment is detected', async () => {
    const patterns = await loadCredentialPatterns();
    const content = `AWS_SECRET_ACCESS_KEY: "${AWS_SECRET_VALUE}"`;
    const matches = scanForCredentials('config.ts', content, patterns);
    expect(matches.length).toBe(1);
    expect(matches[0].matched).toBe('[REDACTED]');
  });

  test('GitHub classic PAT is detected', async () => {
    const patterns = await loadCredentialPatterns();
    const content = `token = ${GITHUB_CLASSIC_PAT}`;
    const matches = scanForCredentials('auth.ts', content, patterns);
    expect(matches.length).toBe(1);
    expect(matches[0].pattern).toBe('github-pat-classic');
  });

  test('generic keyword assignment is no longer detected by defaults', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'secret=wJalrXUtnFEMI';
    const matches = scanForCredentials('env.ts', content, patterns);
    expect(matches.length).toBe(0);
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
      createGeneratedFile(join(TEST_DIR, 'file2.txt'), `token=${GITHUB_CLASSIC_PAT}`),
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
      createGeneratedFile(
        join(TEST_DIR, 'forced.txt'),
        `AWS_SECRET_ACCESS_KEY=${AWS_SECRET_VALUE}`
      ),
    ];

    await expect(
      writeGeneratedFiles(files, { force: true, dryRun: false })
    ).rejects.toThrow(CredentialGuardError);

    await expect(readFile(join(TEST_DIR, 'forced.txt'), 'utf-8')).rejects.toThrow();
  });
});
