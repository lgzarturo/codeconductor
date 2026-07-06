import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CredentialGuardError } from '../src/cli/errors';
import { loadCredentialPatterns } from '../src/core/filesystem/credential-guard';
import {
  isCredentialContent,
  isProtectedPath,
  scanForCredentials,
  type CredentialMatch,
} from '../src/core/filesystem/safety';
import { writeGeneratedFiles } from '../src/core/filesystem/file-writer';
import { createGeneratedFile } from '../src/core/generation/generated-file';

const TEST_DIR = join(import.meta.dir, '..', '.test-credential-guard');

async function cleanup() {
  await rm(TEST_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_DIR, { recursive: true });
});

describe('CredentialGuard patterns', () => {
  test('detects api_key with = assignment', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'const api_key=sk-abc123def456ghi789';
    expect(isCredentialContent(content, patterns)).toBe(true);
  });

  test('detects password with : assignment', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'password: supersecretvalue';
    expect(isCredentialContent(content, patterns)).toBe(true);
  });

  test('detects token with = assignment', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'token=ghp_abcdefghijklmnopqrstuvwxyz';
    expect(isCredentialContent(content, patterns)).toBe(true);
  });

  test('detects secret with = assignment', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'secret=mysecretvalue12345678';
    expect(isCredentialContent(content, patterns)).toBe(true);
  });

  test('clean content passes', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'import { foo } from "bar";\nconst x = 42;\nconsole.log(x);';
    expect(isCredentialContent(content, patterns)).toBe(false);
  });

  test('short value (< 8 chars) does not match', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'api_key=short';
    expect(isCredentialContent(content, patterns)).toBe(false);
  });
});

describe('scanForCredentials', () => {
  test('returns matches with file path, line, pattern, and matched text', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'line 1 safe\npassword=hunter2secret\nline 3 safe';
    const matches = scanForCredentials('test.ts', content, patterns);

    expect(matches.length).toBe(1);
    expect(matches[0].filePath).toBe('test.ts');
    expect(matches[0].line).toBe(2);
    expect(matches[0].matched).toContain('password=hunter2secret');
  });

  test('returns multiple matches across lines', () => {
    // Use explicit non-overlapping patterns to get deterministic results
    const content = 'api_key=sk-abc123def456ghi789\nnormal line\npassword=secretvalue123456';
    const matches = scanForCredentials('multi.ts', content, ['api_key', 'password']);

    expect(matches.length).toBe(2);
    expect(matches[0].line).toBe(1);
    expect(matches[1].line).toBe(3);
  });

  test('returns empty array for clean content', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'import { foo } from "bar";\nconst x = 42;';
    const matches = scanForCredentials('clean.ts', content, patterns);

    expect(matches.length).toBe(0);
  });
});

describe('writeGeneratedFiles credential blocking', () => {
  test('aborts entire batch when credential found in any file', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'safe.txt'), 'This is safe content.'),
      createGeneratedFile(join(TEST_DIR, 'leaked.txt'), 'api_key=sk-abc123def456ghi789'),
    ];

    await expect(
      writeGeneratedFiles(files, { force: false, dryRun: false })
    ).rejects.toThrow(CredentialGuardError);

    // Neither file should have been written
    await expect(readFile(join(TEST_DIR, 'safe.txt'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(TEST_DIR, 'leaked.txt'), 'utf-8')).rejects.toThrow();
  });

  test('writes all files when no credentials detected', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'a.txt'), 'Hello world'),
      createGeneratedFile(join(TEST_DIR, 'b.txt'), 'Goodbye world'),
    ];

    const results = await writeGeneratedFiles(files, { force: false, dryRun: false });
    expect(results.every((r) => r.success)).toBe(true);

    expect(await readFile(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('Hello world');
    expect(await readFile(join(TEST_DIR, 'b.txt'), 'utf-8')).toBe('Goodbye world');
  });

  test('batch abort: 3 files, 2nd has credential → nothing written', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'file1.txt'), 'Safe content one'),
      createGeneratedFile(join(TEST_DIR, 'file2.txt'), 'token=ghp_abcdefghijklmnopqrstuvwxyz'),
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

  test('--force does NOT bypass credential blocking', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'forced.txt'), 'secret=mysecretvalue123456'),
    ];

    await expect(
      writeGeneratedFiles(files, { force: true, dryRun: false })
    ).rejects.toThrow(CredentialGuardError);

    await expect(readFile(join(TEST_DIR, 'forced.txt'), 'utf-8')).rejects.toThrow();
  });

  test('CredentialGuardError contains structured match data', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'match.txt'), 'password=supersecretvalue123'),
    ];

    try {
      await writeGeneratedFiles(files, { force: false, dryRun: false });
      expect(true).toBe(false); // Should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(CredentialGuardError);
      const err = e as CredentialGuardError;
      expect(err.matches.length).toBe(1);
      expect(err.matches[0].filePath).toBe(join(TEST_DIR, 'match.txt'));
      expect(err.matches[0].line).toBe(1);
      expect(err.matches[0].matched).toContain('password=supersecretvalue123');
    }
  });
});

describe('loadCredentialPatterns', () => {
  test('returns default patterns when no config provided', async () => {
    const patterns = await loadCredentialPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns).toContain('password');
    expect(patterns).toContain('token');
  });

  test('merges config patterns with defaults (config takes priority)', async () => {
    const config = {
      safety: {
        secretPatterns: ['custom_secret', 'custom_token'],
      },
    } as any;
    const patterns = await loadCredentialPatterns(config);
    // Config patterns come first, then policy.yml and defaults are merged in
    expect(patterns).toContain('custom_secret');
    expect(patterns).toContain('custom_token');
    expect(patterns).toContain('password'); // from defaults/policy
  });

  test('falls back to defaults when config has empty patterns', async () => {
    const config = {
      safety: {
        secretPatterns: [],
      },
    } as any;
    const patterns = await loadCredentialPatterns(config);
    expect(patterns).toContain('password');
  });
});

describe('isProtectedPath integration', () => {
  test('.env paths are protected', () => {
    expect(isProtectedPath('.env')).toBe(true);
    expect(isProtectedPath('.env.local')).toBe(true);
    expect(isProtectedPath('.env.production')).toBe(true);
  });

  test('secrets paths are protected', () => {
    expect(isProtectedPath('secrets/api-keys.yml')).toBe(true);
    expect(isProtectedPath('credentials/db.json')).toBe(true);
  });

  test('.git paths are protected', () => {
    expect(isProtectedPath('.git/config')).toBe(true);
  });

  test('normal paths are not protected', () => {
    expect(isProtectedPath('src/index.ts')).toBe(false);
    expect(isProtectedPath('config/app.json')).toBe(false);
  });
});
