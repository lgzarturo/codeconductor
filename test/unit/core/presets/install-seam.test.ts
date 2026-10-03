import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManifestEntrySchema } from '../../../../src/validation/schemas';
import { loadPreset } from '../../../../src/core/presets/preset-loader';
import { UpdateTransaction } from '../../../../src/core/install/update-transaction';
import { isErr } from '../../../../src/utils/result';

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-install-seam-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('install seam containment', () => {
  test('manifest entries accept contained relative paths', () => {
    const entry = {
      src: 'commands/cc',
      dest: '.agents/commands',
      strategy: 'overwrite',
    };
    expect(ManifestEntrySchema.safeParse(entry).success).toBe(true);
  });

  test('manifest entries reject absolute src and dest', () => {
    expect(
      ManifestEntrySchema.safeParse({ src: '/etc/passwd', dest: 'x', strategy: 'overwrite' })
        .success,
    ).toBe(false);
    expect(
      ManifestEntrySchema.safeParse({ src: 'x', dest: '/tmp/evil', strategy: 'overwrite' })
        .success,
    ).toBe(false);
  });

  test('manifest entries reject parent traversal in src and dest', () => {
    expect(
      ManifestEntrySchema.safeParse({ src: '../../etc/passwd', dest: 'x', strategy: 'overwrite' })
        .success,
    ).toBe(false);
    expect(
      ManifestEntrySchema.safeParse({ src: 'x', dest: '../outside', strategy: 'overwrite' })
        .success,
    ).toBe(false);
  });

  test('loadPreset rejects traversal names', async () => {
    for (const name of ['../x', '../../etc/passwd', '..\\..\\win', 'a/b']) {
      const result = await loadPreset(name, ROOT);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Invalid preset name');
      }
    }
  });

  test('UpdateTransaction.begin rejects destinations escaping the base path', async () => {
    const base = await mkdtemp(join(ROOT, 'base-'));
    await expect(
      UpdateTransaction.begin(base, [join(base, '..', 'escape.txt')]),
    ).rejects.toThrow();
  });

  test('UpdateTransaction rollback restores snapshotted files inside the base', async () => {
    const base = await mkdtemp(join(ROOT, 'tx-'));
    await mkdir(join(base, '.codeconductor'), { recursive: true });
    const target = join(base, 'file.txt');
    await writeFile(target, 'original', 'utf-8');

    const tx = await UpdateTransaction.begin(base, [target]);
    await writeFile(target, 'modified', 'utf-8');
    await tx.rollback();

    const { readFile } = await import('node:fs/promises');
    expect(await readFile(target, 'utf-8')).toBe('original');
  });
});
