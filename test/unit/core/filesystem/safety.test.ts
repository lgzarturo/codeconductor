import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fileExists,
  isCredentialContent,
  isProtectedPath,
  isWritable,
  scanForCredentials,
  validateWritePath,
} from '../../../../src/core/filesystem/safety';

const PATTERNS = ['API_KEY', 'password', 'aws_secret_access_key'];

describe('core/filesystem/safety', () => {
  describe('isProtectedPath / validateWritePath', () => {
    test('flags protected paths regardless of case', () => {
      expect(isProtectedPath('.git/config')).toBe(true);
      expect(isProtectedPath('project/.ENV')).toBe(true);
      expect(isProtectedPath('app/secrets/keys.txt')).toBe(true);
      expect(isProtectedPath('config/credentials.json')).toBe(true);
    });

    test('allows ordinary paths', () => {
      expect(isProtectedPath('.claude/commands/cc.md')).toBe(false);
      expect(validateWritePath('.opencode/agents/architect.md')).toBe(true);
    });

    test('validateWritePath is the inverse of isProtectedPath', () => {
      expect(validateWritePath('.env')).toBe(false);
    });
  });

  describe('scanForCredentials', () => {
    test('happy path: detects a keyed secret and reports its line', () => {
      const content = 'safe line\nAPI_KEY=abcdefgh12345\n';
      const matches = scanForCredentials('cfg.env', content, PATTERNS);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ filePath: 'cfg.env', line: 2 });
      expect(matches[0]?.matched).toBe('[REDACTED]');
    });

    test('edge case: ignores values shorter than 8 characters', () => {
      const matches = scanForCredentials('cfg.env', 'API_KEY=short', PATTERNS);
      expect(matches).toHaveLength(0);
    });

    test('error case: reports every offending line', () => {
      const content = 'password = supersecretvalue\nAPI_KEY: anotherlongsecret';
      const matches = scanForCredentials('cfg.env', content, PATTERNS);
      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.line)).toEqual([1, 2]);
    });

    test('no patterns means no matches', () => {
      expect(scanForCredentials('f', 'API_KEY=abcdefgh12345', [])).toHaveLength(0);
    });
  });

  describe('isCredentialContent', () => {
    test('returns true when a secret is present', () => {
      expect(isCredentialContent('password=longenoughsecret', PATTERNS)).toBe(true);
    });

    test('returns false for clean content', () => {
      expect(isCredentialContent('const x = 1;', PATTERNS)).toBe(false);
    });
  });

  describe('fileExists / isWritable (real FS)', () => {
    let dir: string;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'cc-safety-'));
      await writeFile(join(dir, 'present.txt'), 'x');
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    test('fileExists is true for an existing file and false otherwise', async () => {
      expect(await fileExists(dir, 'present.txt')).toBe(true);
      expect(await fileExists(dir, 'missing.txt')).toBe(false);
    });

    test('fileExists honours absolute filenames', async () => {
      expect(await fileExists(dir, join(dir, 'present.txt'))).toBe(true);
    });

    test('isWritable is true for a writable temp dir and false for a missing one', async () => {
      expect(await isWritable(dir)).toBe(true);
      expect(await isWritable(join(dir, 'does-not-exist'))).toBe(false);
    });
  });
});
