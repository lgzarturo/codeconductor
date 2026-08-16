import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  resolveOutputWithinRoot,
  writeContainedFile,
} from '../src/core/filesystem/path-containment';
import { seoAuditCommand } from '../src/commands/seo-audit.command';
import { seoLlmsCommand } from '../src/commands/seo-llms.command';
import { parseArgs, routeCommand } from '../src/cli/router';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const TEST_DIR = resolve(import.meta.dir, '.seo-output-fixtures');
/** Sibling directory that shares the root prefix — catches naive startsWith checks. */
const SIBLING_PREFIX_DIR = `${TEST_DIR}-evil`;
/** Unrelated directory outside the root. */
const OUTSIDE_DIR = resolve(import.meta.dir, '.seo-output-outside');

/**
 * Create a symlink, reporting whether the platform allowed it.
 *
 * Windows denies symlink creation without elevation or Developer Mode. Only
 * privilege errors are tolerated — any other failure is a real defect and
 * propagates.
 */
async function trySymlink(
  target: string,
  linkPath: string,
  type: 'file' | 'dir' | 'junction',
): Promise<boolean> {
  try {
    await symlink(target, linkPath, type);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      return false;
    }
    throw err;
  }
}

beforeEach(async () => {
  for (const dir of [TEST_DIR, SIBLING_PREFIX_DIR, OUTSIDE_DIR]) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }
});

afterEach(async () => {
  for (const dir of [TEST_DIR, SIBLING_PREFIX_DIR, OUTSIDE_DIR]) {
    await rm(dir, { recursive: true, force: true });
  }
  await rm(resolve(import.meta.dir, '.seo-output-rootlink'), { force: true });
});

// ─── Rejected output paths ───────────────────────────────────────────────────

describe('SEO output containment — rejected paths', () => {
  it('rejects an absolute output path outside the root', async () => {
    const absPath = resolve(OUTSIDE_DIR, 'report.md');

    expect(await resolveOutputWithinRoot(TEST_DIR, absPath)).toBeUndefined();
    await expect(writeContainedFile(TEST_DIR, absPath, 'PWNED')).rejects.toThrow();
    expect(await readFile(absPath, 'utf-8').catch(() => undefined)).toBeUndefined();
  });

  it('rejects an absolute output path even when it points inside the root', async () => {
    // The output contract is relative-only: absolute input is out of contract.
    const absPath = resolve(TEST_DIR, 'report.md');

    expect(await resolveOutputWithinRoot(TEST_DIR, absPath)).toBeUndefined();
    await expect(writeContainedFile(TEST_DIR, absPath, 'PWNED')).rejects.toThrow();
  });

  it('rejects ../ traversal outside the root', async () => {
    const relPath = `../${basename(OUTSIDE_DIR)}/report.md`;

    expect(await resolveOutputWithinRoot(TEST_DIR, relPath)).toBeUndefined();
    await expect(writeContainedFile(TEST_DIR, relPath, 'PWNED')).rejects.toThrow();
    expect(
      await readFile(resolve(OUTSIDE_DIR, 'report.md'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });

  it('rejects a sibling directory sharing the root prefix', async () => {
    const relPath = `../${basename(SIBLING_PREFIX_DIR)}/report.md`;

    expect(await resolveOutputWithinRoot(TEST_DIR, relPath)).toBeUndefined();
    await expect(writeContainedFile(TEST_DIR, relPath, 'PWNED')).rejects.toThrow();
    expect(
      await readFile(resolve(SIBLING_PREFIX_DIR, 'report.md'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });

  it('rejects the root itself as an output target', async () => {
    expect(await resolveOutputWithinRoot(TEST_DIR, '.')).toBeUndefined();
    expect(await resolveOutputWithinRoot(TEST_DIR, '')).toBeUndefined();
  });

  it('rejects writing through a directory symlink that escapes the root', async () => {
    const created = await trySymlink(OUTSIDE_DIR, resolve(TEST_DIR, 'linkdir'), 'junction');
    if (!created) return; // platform denies symlink creation without privileges

    expect(await resolveOutputWithinRoot(TEST_DIR, 'linkdir/report.md')).toBeUndefined();
    await expect(writeContainedFile(TEST_DIR, 'linkdir/report.md', 'PWNED')).rejects.toThrow();
    expect(
      await readFile(resolve(OUTSIDE_DIR, 'report.md'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });

  it('rejects a new nested path underneath an escaping directory symlink', async () => {
    const created = await trySymlink(OUTSIDE_DIR, resolve(TEST_DIR, 'linkdir'), 'junction');
    if (!created) return;

    expect(await resolveOutputWithinRoot(TEST_DIR, 'linkdir/deep/report.md')).toBeUndefined();
    await expect(writeContainedFile(TEST_DIR, 'linkdir/deep/report.md', 'PWNED')).rejects.toThrow();
    expect(
      await readFile(resolve(OUTSIDE_DIR, 'deep/report.md'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });

  it('rejects an existing output file that is a symlink pointing outside the root', async () => {
    await writeFile(resolve(OUTSIDE_DIR, 'target.md'), 'ORIGINAL', 'utf-8');
    const created = await trySymlink(
      resolve(OUTSIDE_DIR, 'target.md'),
      resolve(TEST_DIR, 'report.md'),
      'file',
    );
    if (!created) return;

    expect(await resolveOutputWithinRoot(TEST_DIR, 'report.md')).toBeUndefined();
    await expect(writeContainedFile(TEST_DIR, 'report.md', 'PWNED', { force: true })).rejects.toThrow();
    expect(await readFile(resolve(OUTSIDE_DIR, 'target.md'), 'utf-8')).toBe('ORIGINAL');
  });

  it('rejects an existing output file that is a symlink inside the root even with force', async () => {
    const target = resolve(TEST_DIR, 'target.md');
    await writeFile(target, 'ORIGINAL', 'utf-8');
    const created = await trySymlink(target, resolve(TEST_DIR, 'report.md'), 'file');
    if (!created) return;

    await expect(
      writeContainedFile(TEST_DIR, 'report.md', 'PWNED', { force: true }),
    ).rejects.toThrow(/symlink|output/i);
    expect(await readFile(target, 'utf-8')).toBe('ORIGINAL');
  });

  it('rejects writing through a directory symlink into .git even with force', async () => {
    const gitDir = resolve(TEST_DIR, '.git');
    await mkdir(gitDir, { recursive: true });
    await writeFile(resolve(gitDir, 'HEAD'), 'ref: refs/heads/main', 'utf-8');
    const created = await trySymlink(gitDir, resolve(TEST_DIR, 'evil'), 'junction');
    if (!created) return;

    expect(await resolveOutputWithinRoot(TEST_DIR, 'evil/config')).toBeUndefined();
    await expect(
      writeContainedFile(TEST_DIR, 'evil/config', 'PWNED', { force: true }),
    ).rejects.toThrow(/protected|output/i);
    expect(await readFile(resolve(gitDir, 'HEAD'), 'utf-8')).toBe('ref: refs/heads/main');
    expect(
      await readFile(resolve(gitDir, 'config'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });

  it('rejects writing through a directory symlink into secrets even with force', async () => {
    const secretsDir = resolve(TEST_DIR, 'secrets');
    await mkdir(secretsDir, { recursive: true });
    await writeFile(resolve(secretsDir, 'token'), 'ORIGINAL', 'utf-8');
    const created = await trySymlink(secretsDir, resolve(TEST_DIR, 'alias'), 'junction');
    if (!created) return;

    expect(await resolveOutputWithinRoot(TEST_DIR, 'alias/token')).toBeUndefined();
    await expect(
      writeContainedFile(TEST_DIR, 'alias/token', 'PWNED', { force: true }),
    ).rejects.toThrow(/protected|output/i);
    expect(await readFile(resolve(secretsDir, 'token'), 'utf-8')).toBe('ORIGINAL');
  });
});

// ─── Allowed output paths ────────────────────────────────────────────────────

describe('SEO output containment — allowed paths', () => {
  it('writes a relative file at the root and returns its canonical absolute path', async () => {
    const written = await writeContainedFile(TEST_DIR, 'report.md', 'REPORT');

    expect(written).toBe(resolve(await realpath(TEST_DIR), 'report.md'));
    expect(await readFile(written, 'utf-8')).toBe('REPORT');
  });

  it('creates new nested directories for a contained output path', async () => {
    const written = await writeContainedFile(
      TEST_DIR,
      'seo-reports/deep/audit-report.md',
      'NESTED',
    );

    expect(written).toBe(
      resolve(await realpath(TEST_DIR), 'seo-reports/deep/audit-report.md'),
    );
    expect(await readFile(written, 'utf-8')).toBe('NESTED');
  });

  it('accepts a relative path that re-enters the root after traversal', async () => {
    await mkdir(resolve(TEST_DIR, 'seo-reports'), { recursive: true });
    const written = await writeContainedFile(TEST_DIR, 'seo-reports/../inside.md', 'INSIDE');

    expect(written).toBe(resolve(await realpath(TEST_DIR), 'inside.md'));
    expect(await readFile(written, 'utf-8')).toBe('INSIDE');
  });

  it('accepts a project root reached through a symlink', async () => {
    const rootLink = resolve(import.meta.dir, '.seo-output-rootlink');
    const created = await trySymlink(TEST_DIR, rootLink, 'junction');
    if (!created) return;

    const written = await writeContainedFile(rootLink, 'report.md', 'VIA LINK');

    expect(written).toBe(resolve(await realpath(TEST_DIR), 'report.md'));
    expect(await readFile(resolve(TEST_DIR, 'report.md'), 'utf-8')).toBe('VIA LINK');
  });
});

// ─── Overwrite policy ────────────────────────────────────────────────────────

describe('SEO output containment — overwrite policy', () => {
  it('refuses to overwrite an existing file without force and leaves it intact', async () => {
    const target = resolve(TEST_DIR, 'report.md');
    await writeFile(target, 'ORIGINAL', 'utf-8');

    await expect(writeContainedFile(TEST_DIR, 'report.md', 'REPLACED')).rejects.toThrow(
      /already exists/i,
    );
    expect(await readFile(target, 'utf-8')).toBe('ORIGINAL');
  });

  it('overwrites an existing file when force is set', async () => {
    const target = resolve(TEST_DIR, 'report.md');
    await writeFile(target, 'ORIGINAL', 'utf-8');

    const written = await writeContainedFile(TEST_DIR, 'report.md', 'REPLACED', { force: true });

    expect(written).toBe(resolve(await realpath(TEST_DIR), 'report.md'));
    expect(await readFile(target, 'utf-8')).toBe('REPLACED');
  });

  it('creates exclusively, so concurrent writes without force cannot both succeed', async () => {
    const results = await Promise.allSettled([
      writeContainedFile(TEST_DIR, 'race.md', 'FIRST'),
      writeContainedFile(TEST_DIR, 'race.md', 'SECOND'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const content = await readFile(resolve(TEST_DIR, 'race.md'), 'utf-8');
    expect(['FIRST', 'SECOND']).toContain(content);
  });

  it('rejects a file created after resolution when force is not set', async () => {
    // Mirrors the TOCTOU window: the path is clean at resolution time and the
    // attacker plants the file before the write lands.
    const resolved = await resolveOutputWithinRoot(TEST_DIR, 'planted.md');
    expect(resolved).toBeDefined();
    await writeFile(resolved!, 'PLANTED', 'utf-8');

    await expect(writeContainedFile(TEST_DIR, 'planted.md', 'REPLACED')).rejects.toThrow(
      /already exists/i,
    );
    expect(await readFile(resolved!, 'utf-8')).toBe('PLANTED');
  });
});

// ─── Command-level containment (identical for audit and llms) ─────────────────

describe('SEO commands reject escaping --output before doing any work', () => {
  const escaping = `../${basename(OUTSIDE_DIR)}/report.md`;

  it('seo audit rejects an escaping --output', async () => {
    const result = await seoAuditCommand({
      url: 'https://example.com',
      format: 'markdown',
      failOn: 'error',
      delay: 0,
      output: escaping,
      followRedirects: false,
      projectRoot: TEST_DIR,
    });

    expect(result.code).toBe(1);
    const data = result.data as { success: boolean; errors: string[] };
    expect(data.success).toBe(false);
    expect(data.errors.join(' ')).toMatch(/output/i);
    expect(
      await readFile(resolve(OUTSIDE_DIR, 'report.md'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });

  it('seo audit rejects an absolute --output', async () => {
    const result = await seoAuditCommand({
      url: 'https://example.com',
      format: 'markdown',
      failOn: 'error',
      delay: 0,
      output: resolve(OUTSIDE_DIR, 'abs.md'),
      followRedirects: false,
      projectRoot: TEST_DIR,
    });

    expect(result.code).toBe(1);
  });

  it('seo llms rejects an escaping --output', async () => {
    const result = await seoLlmsCommand({
      url: 'https://example.com',
      output: escaping,
      delay: 0,
      projectRoot: TEST_DIR,
    });

    expect(result.code).toBe(1);
    const data = result.data as { success: boolean; errors: string[] };
    expect(data.success).toBe(false);
    expect(data.errors.join(' ')).toMatch(/output/i);
    expect(
      await readFile(resolve(OUTSIDE_DIR, 'report.md'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });

  it('seo llms rejects an absolute --output', async () => {
    const result = await seoLlmsCommand({
      url: 'https://example.com',
      output: resolve(OUTSIDE_DIR, 'abs.txt'),
      delay: 0,
      projectRoot: TEST_DIR,
    });

    expect(result.code).toBe(1);
  });

  it('--force does not relax containment', async () => {
    const parsed = parseArgs([
      'seo',
      'audit',
      '--url',
      'https://example.com',
      '--output',
      escaping,
      '--force',
    ]);

    expect(parsed.flags.force).toBe(true);

    const result = await routeCommand(parsed, TEST_DIR);

    expect(result.code).toBe(1);
    expect(
      await readFile(resolve(OUTSIDE_DIR, 'report.md'), 'utf-8').catch(() => undefined),
    ).toBeUndefined();
  });
});

describe('SEO commands preflight protected and existing outputs before network work', () => {
  const invalidUrl = 'not-a-valid-url';
  const protectedOutputs = ['.env', '.git/seo-report.md', 'secrets/seo-report.md'] as const;

  for (const output of protectedOutputs) {
    it(`seo audit rejects protected output ${output} even with force`, async () => {
      const result = await seoAuditCommand({
        url: invalidUrl,
        format: 'markdown',
        failOn: 'error',
        delay: 0,
        output,
        followRedirects: false,
        projectRoot: TEST_DIR,
        force: true,
      });

      expect(result.code).toBe(1);
      expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/output|protected/i);
    });

    it(`seo llms rejects protected output ${output} even with force`, async () => {
      const result = await seoLlmsCommand({
        url: invalidUrl,
        output,
        delay: 0,
        projectRoot: TEST_DIR,
        force: true,
      });

      expect(result.code).toBe(1);
      expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/output|protected/i);
    });
  }

  it('seo audit rejects an existing output without force before URL processing', async () => {
    await writeFile(resolve(TEST_DIR, 'existing.md'), 'ORIGINAL', 'utf-8');

    const result = await seoAuditCommand({
      url: invalidUrl,
      format: 'markdown',
      failOn: 'error',
      delay: 0,
      output: 'existing.md',
      followRedirects: false,
      projectRoot: TEST_DIR,
    });

    expect(result.code).toBe(1);
    expect(await readFile(resolve(TEST_DIR, 'existing.md'), 'utf-8')).toBe('ORIGINAL');
  });

  it('seo llms rejects an existing output without force before URL processing', async () => {
    await writeFile(resolve(TEST_DIR, 'existing.txt'), 'ORIGINAL', 'utf-8');

    const result = await seoLlmsCommand({
      url: invalidUrl,
      output: 'existing.txt',
      delay: 0,
      projectRoot: TEST_DIR,
    });

    expect(result.code).toBe(1);
    expect(await readFile(resolve(TEST_DIR, 'existing.txt'), 'utf-8')).toBe('ORIGINAL');
  });

  it('seo audit rejects a directory symlink into .git before network work', async () => {
    const gitDir = resolve(TEST_DIR, '.git');
    await mkdir(gitDir, { recursive: true });
    const created = await trySymlink(gitDir, resolve(TEST_DIR, 'evil'), 'junction');
    if (!created) return;

    const result = await seoAuditCommand({
      url: invalidUrl,
      format: 'markdown',
      failOn: 'error',
      delay: 0,
      output: 'evil/seo-report.md',
      followRedirects: false,
      projectRoot: TEST_DIR,
      force: true,
    });

    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/output|protected/i);
  });
});
