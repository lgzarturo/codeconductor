import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';
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

// Synthetic values with valid provider shapes. None are real credentials.
const AWS_ACCESS_KEY_ID = 'AKIADF5QFN6FEW8NR2ZB';
const AWS_TEMP_ACCESS_KEY_ID = 'ASIABOWMRM1F9AVG95MI';
const AWS_SECRET_VALUE = 'iWKREwR1EHN1cd8EjxuH4BtVjwXs6kDaA7GYTJgF';
const GITHUB_CLASSIC_PAT = 'ghp_SjFfZ22D3xmS8Okei21GhbjxE5u3QwbcySbM';
const GITHUB_FINE_GRAINED_PAT =
  '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';
const PLACEHOLDER_LIKE_SUBSTRINGS = [
  'sample',
  'dummy',
  'xxxx',
  'placeholder',
  'redacted',
  'changeme',
  'your',
] as const;

async function cleanup() {
  await rm(TEST_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_DIR, { recursive: true });
});

describe('built-in defaults reject generic keyword detection', () => {
  test('token= assignment is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('token=placeholder', patterns)).toBe(false);
  });

  test('generic password assignment is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('password: supersecretvalue', patterns)).toBe(false);
  });

  test('generic api_key assignment is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('const api_key=sk-abc123def456ghi789', patterns)).toBe(false);
  });

  test('generic secret assignment is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('secret=mysecretvalue12345678', patterns)).toBe(false);
  });

  test('clean content passes', async () => {
    const patterns = await loadCredentialPatterns();
    const content = 'import { foo } from "bar";\nconst x = 42;\nconsole.log(x);';
    expect(isCredentialContent(content, patterns)).toBe(false);
  });
});

describe('high-confidence signatures — positives', () => {
  test('AWS access key id (AKIA)', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent(`aws_access_key_id = ${AWS_ACCESS_KEY_ID}`, patterns)).toBe(true);
  });

  test('AWS temporary access key id (ASIA)', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent(`id: ${AWS_TEMP_ACCESS_KEY_ID}`, patterns)).toBe(true);
  });

  test('AWS_SECRET_ACCESS_KEY with 40-char value', async () => {
    const patterns = await loadCredentialPatterns();
    expect(
      isCredentialContent(`AWS_SECRET_ACCESS_KEY=${AWS_SECRET_VALUE}`, patterns)
    ).toBe(true);
  });

  test('AWS_SECRET_ACCESS_KEY with quoted value and colon', async () => {
    const patterns = await loadCredentialPatterns();
    expect(
      isCredentialContent(`  AWS_SECRET_ACCESS_KEY: "${AWS_SECRET_VALUE}"`, patterns)
    ).toBe(true);
  });

  test('GitHub classic PAT', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent(`const t = "${GITHUB_CLASSIC_PAT}";`, patterns)).toBe(true);
  });

  test('GitHub fine-grained PAT', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent(`Authorization: Bearer ${GITHUB_FINE_GRAINED_PAT}`, patterns)).toBe(
      true
    );
  });

  test('PEM private key headers', async () => {
    const patterns = await loadCredentialPatterns();
    for (const header of [
      '-----BEGIN PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----',
      '-----BEGIN EC PRIVATE KEY-----',
      '-----BEGIN ENCRYPTED PRIVATE KEY-----',
    ]) {
      expect(isCredentialContent(header, patterns)).toBe(true);
    }
  });

  test('OpenSSH private key header', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('-----BEGIN OPENSSH PRIVATE KEY-----', patterns)).toBe(true);
  });

  test('structurally valid GitHub classic PATs remain detected when payloads contain placeholder-like substrings', async () => {
    const patterns = await loadCredentialPatterns();
    const detections = PLACEHOLDER_LIKE_SUBSTRINGS.map((substring) => {
      const token = `ghp_${substring.padEnd(36, 'A')}`;
      expect(token).toHaveLength(40);
      return isCredentialContent(`token="${token}",`, patterns);
    });

    expect(detections).toEqual(PLACEHOLDER_LIKE_SUBSTRINGS.map(() => true));
  });

  test('structurally valid GitHub fine-grained PAT remains detected when either segment contains placeholder-like substrings', async () => {
    const patterns = await loadCredentialPatterns();
    const tokens = [
      `github_pat_${'sample'.padEnd(22, 'A')}_${'B'.repeat(59)}`,
      `github_pat_${'A'.repeat(22)}_${'dummy'.padEnd(59, 'B')}`,
    ];

    expect(tokens.every((token) => token.length === 93)).toBe(true);
    expect(tokens.map((token) => isCredentialContent(`Bearer (${token});`, patterns))).toEqual([
      true,
      true,
    ]);
  });

  test('structurally valid AWS access key ids remain detected when payloads contain placeholder-like substrings', async () => {
    const patterns = await loadCredentialPatterns();
    const detections = PLACEHOLDER_LIKE_SUBSTRINGS.map((substring) => {
      const payload = substring.toUpperCase().padEnd(16, 'A');
      const accessKeyId = `AKIA${payload}`;
      expect(accessKeyId).toHaveLength(20);
      return isCredentialContent(`id='${accessKeyId}',`, patterns);
    });

    expect(detections).toEqual(PLACEHOLDER_LIKE_SUBSTRINGS.map(() => true));
  });

  test('structurally valid AWS secret values remain detected when they contain placeholder-like substrings', async () => {
    const patterns = await loadCredentialPatterns();
    const detections = PLACEHOLDER_LIKE_SUBSTRINGS.map((substring) => {
      const value = substring.padEnd(40, 'A');
      expect(value).toHaveLength(40);
      return isCredentialContent(`AWS_SECRET_ACCESS_KEY: '${value}',`, patterns);
    });

    expect(detections).toEqual(PLACEHOLDER_LIKE_SUBSTRINGS.map(() => true));
  });

  test('credential signatures are detected next to quotes and punctuation', async () => {
    const patterns = await loadCredentialPatterns();
    const cases = [
      `("${AWS_ACCESS_KEY_ID}"),`,
      `token='${GITHUB_CLASSIC_PAT}';`,
      `Bearer [${GITHUB_FINE_GRAINED_PAT}].`,
      `AWS_SECRET_ACCESS_KEY="${AWS_SECRET_VALUE}",`,
    ];

    for (const content of cases) {
      expect(isCredentialContent(content, patterns)).toBe(true);
    }
  });
});

describe('high-confidence signatures — negatives', () => {
  test('AWS access key id with wrong length is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('AKIADF5QFN6FEW8NR2Z', patterns)).toBe(false);
    expect(isCredentialContent('AKIADF5QFN6FEW8NR2ZBX', patterns)).toBe(false);
  });

  test('lowercase AWS access key id is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent(AWS_ACCESS_KEY_ID.toLowerCase(), patterns)).toBe(false);
  });

  test('documented AWS example credentials are not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('AKIAIOSFODNN7EXAMPLE', patterns)).toBe(false);
    expect(
      isCredentialContent(
        'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        patterns
      )
    ).toBe(false);
  });

  test('only the exact known AWS demo values are excluded, not other valid values containing EXAMPLE', async () => {
    const patterns = await loadCredentialPatterns();
    const accessKeyId = `AKIA${'EXAMPLE'.padEnd(16, 'A')}`;
    const secretValue = 'EXAMPLE'.padEnd(40, 'A');

    expect(accessKeyId).toHaveLength(20);
    expect(secretValue).toHaveLength(40);
    expect([
      isCredentialContent(accessKeyId, patterns),
      isCredentialContent(`AWS_SECRET_ACCESS_KEY=${secretValue}`, patterns),
    ]).toEqual([true, true]);
  });

  test('documentation placeholders that do not satisfy provider shapes are not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    const placeholders = [
      'AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx',
      'AWS_SECRET_ACCESS_KEY=<your-40-character-secret>',
      'token=ghp_xxxx',
      'token=github_pat_YOUR_TOKEN',
      '-----BEGIN YOUR KEY-----',
    ];

    for (const placeholder of placeholders) {
      expect(isCredentialContent(placeholder, patterns)).toBe(false);
    }
  });

  test('AWS secret with wrong value length is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('AWS_SECRET_ACCESS_KEY=short', patterns)).toBe(false);
    expect(
      isCredentialContent(`AWS_SECRET_ACCESS_KEY=${AWS_SECRET_VALUE.slice(0, 39)}`, patterns)
    ).toBe(false);
  });

  test('40-char value under a different variable name is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent(`MY_SECRET=${AWS_SECRET_VALUE}`, patterns)).toBe(false);
  });

  test('malformed GitHub tokens are not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('token=ghp_abcdefghijklmnopqrstuvwxyz', patterns)).toBe(false);
    expect(isCredentialContent(`${GITHUB_CLASSIC_PAT.slice(0, -1)}`, patterns)).toBe(false);
    expect(isCredentialContent('github_pat_tooshort', patterns)).toBe(false);
  });

  test('GitHub token signatures require exact lengths', async () => {
    const patterns = await loadCredentialPatterns();
    const classicPayload = 'A'.repeat(36);
    const finePrefix = 'A'.repeat(22);
    const fineSuffix = 'B'.repeat(59);

    expect(isCredentialContent(`ghp_${classicPayload}`, patterns)).toBe(true);
    expect(isCredentialContent(`ghp_${classicPayload.slice(1)}`, patterns)).toBe(false);
    expect(isCredentialContent(`ghp_${classicPayload}A`, patterns)).toBe(false);
    expect(isCredentialContent(`github_pat_${finePrefix}_${fineSuffix}`, patterns)).toBe(true);
    expect(
      isCredentialContent(`github_pat_${finePrefix.slice(1)}_${fineSuffix}`, patterns)
    ).toBe(false);
    expect(
      isCredentialContent(`github_pat_${finePrefix}_${fineSuffix}B`, patterns)
    ).toBe(false);
  });

  test('provider prefixes and PEM headers remain case-sensitive', async () => {
    const patterns = await loadCredentialPatterns();

    expect(isCredentialContent(GITHUB_CLASSIC_PAT.replace('ghp_', 'GHP_'), patterns)).toBe(false);
    expect(isCredentialContent(GITHUB_FINE_GRAINED_PAT.replace('github_pat_', 'GITHUB_PAT_'), patterns)).toBe(false);
    expect(isCredentialContent('-----begin private key-----', patterns)).toBe(false);
    expect(
      isCredentialContent(`aws_secret_access_key=${AWS_SECRET_VALUE}`, patterns)
    ).toBe(false);
  });

  test('credential signatures do not match inside longer identifier-like text', async () => {
    const patterns = await loadCredentialPatterns();

    expect(isCredentialContent(`prefix${AWS_ACCESS_KEY_ID}`, patterns)).toBe(false);
    expect(isCredentialContent(`${GITHUB_CLASSIC_PAT}suffix`, patterns)).toBe(false);
    expect(isCredentialContent(`prefix${GITHUB_FINE_GRAINED_PAT}`, patterns)).toBe(false);
  });

  test('public key and certificate headers are not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('-----BEGIN PUBLIC KEY-----', patterns)).toBe(false);
    expect(isCredentialContent('-----BEGIN CERTIFICATE-----', patterns)).toBe(false);
  });

  test('prose mentioning a private key is not flagged', async () => {
    const patterns = await loadCredentialPatterns();
    expect(isCredentialContent('Store the private key outside the repo.', patterns)).toBe(false);
  });
});

describe('scanForCredentials', () => {
  test('returns matches with file path, line, pattern, and redacted text', async () => {
    const patterns = await loadCredentialPatterns();
    const content = `line 1 safe\nAWS_SECRET_ACCESS_KEY=${AWS_SECRET_VALUE}\nline 3 safe`;
    const matches = scanForCredentials('test.ts', content, patterns);

    expect(matches.length).toBe(1);
    expect(matches[0].filePath).toBe('test.ts');
    expect(matches[0].line).toBe(2);
    expect(matches[0].pattern).toBe('aws-secret-access-key');
    expect(matches[0].matched).toBe('[REDACTED]');
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

describe('custom secretPatterns remain opt-in legacy matching', () => {
  test('project pattern detects keyword assignment', () => {
    const matches = scanForCredentials('f.ts', 'custom_secret=abcdefgh12345', ['custom_secret']);
    expect(matches.length).toBe(1);
    expect(matches[0].line).toBe(1);
  });

  test('legacy keyword still honours the 8-char minimum value', () => {
    expect(scanForCredentials('f.ts', 'custom_secret=short', ['custom_secret'])).toHaveLength(0);
  });

  test('no patterns means only high-confidence signatures apply', () => {
    expect(scanForCredentials('f.ts', 'api_key=abcdefgh12345', [])).toHaveLength(0);
    expect(scanForCredentials('f.ts', `id=${AWS_ACCESS_KEY_ID}`, [])).toHaveLength(1);
  });

  test('custom patterns still detect and redact values containing placeholder-like words', () => {
    const matches = scanForCredentials(
      'f.ts',
      'custom_secret=dummyvalue123',
      ['custom_secret']
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].matched).toBe('[REDACTED]');
    expect(JSON.stringify(matches)).not.toContain('dummyvalue123');
  });

  test('treats plus as literal keyword text and not as a regex quantifier', () => {
    expect(scanForCredentials('f.ts', 'a+=abcdefgh12345', ['a+'])).toHaveLength(1);
    expect(scanForCredentials('f.ts', 'aaaa=abcdefgh12345', ['a+'])).toHaveLength(0);
  });

  test('accepts an unmatched parenthesis as a literal keyword without throwing', () => {
    expect(scanForCredentials('f.ts', '(=abcdefgh12345', ['('])).toHaveLength(1);
  });
});

describe('tracked policy secretPatterns parity', () => {
  test('root and installed preset policies define identical secretPatterns', async () => {
    const rootPolicy = yamlParse(
      await readFile(resolve(import.meta.dir, '..', 'policy.yml'), 'utf-8')
    ) as { secretPatterns?: unknown };
    const presetPolicy = yamlParse(
      await readFile(
        resolve(import.meta.dir, '..', '.codeconductor', 'presets', 'policy.yml'),
        'utf-8'
      )
    ) as { secretPatterns?: unknown };

    expect(presetPolicy.secretPatterns).toEqual(rootPolicy.secretPatterns);
  });
});

describe('no secret leakage in match output', () => {
  const cases: ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> = [
    ['aws access key id', `id=${AWS_ACCESS_KEY_ID}`, []],
    ['aws secret', `AWS_SECRET_ACCESS_KEY=${AWS_SECRET_VALUE}`, []],
    ['github classic pat', `t=${GITHUB_CLASSIC_PAT}`, []],
    ['github fine-grained pat', `t=${GITHUB_FINE_GRAINED_PAT}`, []],
    ['private key header', '-----BEGIN OPENSSH PRIVATE KEY-----', []],
    ['custom legacy pattern', 'custom_secret=abcdefgh12345', ['custom_secret']],
  ];

  for (const [name, content, patterns] of cases) {
    test(`${name}: matched is redacted and payload never serialized`, () => {
      const matches = scanForCredentials('leak.ts', content, patterns);
      expect(matches.length).toBe(1);
      expect(matches[0].matched).toBe('[REDACTED]');

      const serialized = JSON.stringify(matches);
      expect(serialized).not.toContain(AWS_ACCESS_KEY_ID);
      expect(serialized).not.toContain(AWS_SECRET_VALUE);
      expect(serialized).not.toContain(GITHUB_CLASSIC_PAT);
      expect(serialized).not.toContain(GITHUB_FINE_GRAINED_PAT);
      expect(serialized).not.toContain('abcdefgh12345');
    });
  }

  test('CredentialGuardError never carries the secret value', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'leak.txt'), `AWS_SECRET_ACCESS_KEY=${AWS_SECRET_VALUE}`),
    ];

    try {
      await writeGeneratedFiles(files, { force: false, dryRun: false });
      expect(true).toBe(false); // Should not reach
    } catch (e) {
      const err = e as CredentialGuardError;
      expect(err).toBeInstanceOf(CredentialGuardError);
      const serialized = `${err.message}${JSON.stringify(err.matches)}${JSON.stringify(err.details ?? null)}`;
      expect(serialized).not.toContain(AWS_SECRET_VALUE);
      expect(err.matches[0].matched).toBe('[REDACTED]');
    }
  });

  test('CredentialGuardError rejects a valid placeholder-like token without leaking it', async () => {
    const token = `ghp_${'dummy'.padEnd(36, 'A')}`;
    const files = [
      createGeneratedFile(join(TEST_DIR, 'placeholder-like.txt'), `token=${token}`),
    ];
    let caught: unknown;

    try {
      await writeGeneratedFiles(files, { force: false, dryRun: false });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CredentialGuardError);
    const err = caught as CredentialGuardError;
    expect(err.matches[0].matched).toBe('[REDACTED]');
    expect(`${err.message}${JSON.stringify(err.matches)}`).not.toContain(token);
  });
});

describe('writeGeneratedFiles credential blocking', () => {
  test('aborts entire batch when credential found in any file', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'safe.txt'), 'This is safe content.'),
      createGeneratedFile(join(TEST_DIR, 'leaked.txt'), `api_key=${AWS_ACCESS_KEY_ID}`),
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

  test('--force does NOT bypass credential blocking', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'forced.txt'), `secret=${GITHUB_FINE_GRAINED_PAT}`),
    ];

    await expect(
      writeGeneratedFiles(files, { force: true, dryRun: false })
    ).rejects.toThrow(CredentialGuardError);

    await expect(readFile(join(TEST_DIR, 'forced.txt'), 'utf-8')).rejects.toThrow();
  });

  test('CredentialGuardError contains structured match data', async () => {
    const files = [
      createGeneratedFile(join(TEST_DIR, 'match.txt'), `password=${AWS_ACCESS_KEY_ID}`),
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
      expect(err.matches[0].matched).toBe('[REDACTED]');
    }
  });
});

describe('loadCredentialPatterns', () => {
  test('returns no generic keyword patterns when no config provided', async () => {
    const patterns = await loadCredentialPatterns();
    expect(patterns).not.toContain('password');
    expect(patterns).not.toContain('token');
    expect(patterns).not.toContain('api_key');
  });

  test('keeps project custom patterns as opt-in legacy matching', async () => {
    const config = {
      safety: {
        secretPatterns: ['custom_secret', 'custom_token'],
      },
    } as any;
    const patterns = await loadCredentialPatterns(config);
    expect(patterns).toContain('custom_secret');
    expect(patterns).toContain('custom_token');
    expect(patterns).not.toContain('password');
  });

  test('empty config patterns yield no keyword patterns', async () => {
    const config = {
      safety: {
        secretPatterns: [],
      },
    } as any;
    const patterns = await loadCredentialPatterns(config);
    expect(patterns).toHaveLength(0);
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
