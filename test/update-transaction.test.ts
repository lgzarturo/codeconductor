import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateTransaction } from '../src/core/install/update-transaction';

describe('UpdateTransaction', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cc-update-transaction-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('restores existing files and removes files created by a failed update', async () => {
    const existing = join(root, 'existing.yml');
    const created = join(root, 'created.yml');
    await writeFile(existing, 'before\n');

    const transaction = await UpdateTransaction.begin(root, [existing, created]);
    await writeFile(existing, 'partially-updated\n');
    await mkdir(join(root, '.codeconductor'), { recursive: true });
    await writeFile(created, 'new\n');

    await transaction.rollback();

    expect(await readFile(existing, 'utf-8')).toBe('before\n');
    expect(await Bun.file(created).exists()).toBe(false);
    expect(await Bun.file(join(root, '.codeconductor', 'backups')).exists()).toBe(false);
  });
});
