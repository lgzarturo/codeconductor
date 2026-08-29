import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureOpenspecGitignore,
  OPENSPEC_GITIGNORE_ENTRIES,
  OPENSPEC_GITIGNORE_HEADER,
} from '../../../../src/core/openspec/openspec-gitignore';

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-openspec-gitignore-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('ensureOpenspecGitignore', () => {
  test('creates .gitignore with OpenSpec entries when absent', async () => {
    const dir = await mkdtemp(join(ROOT, 'none-'));
    const changed = await ensureOpenspecGitignore(dir);
    expect(changed).toBe('.gitignore');
    const content = await readFile(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain(OPENSPEC_GITIGNORE_HEADER);
    for (const entry of OPENSPEC_GITIGNORE_ENTRIES) {
      expect(content).toContain(entry);
    }
  });

  test('appends missing entries without rewriting existing rules', async () => {
    const dir = await mkdtemp(join(ROOT, 'partial-'));
    await writeFile(join(dir, '.gitignore'), 'node_modules/\n', 'utf-8');
    const changed = await ensureOpenspecGitignore(dir);
    expect(changed).toBe('.gitignore');
    const content = await readFile(join(dir, '.gitignore'), 'utf-8');
    expect(content.startsWith('node_modules/\n')).toBe(true);
    expect(content).toContain(OPENSPEC_GITIGNORE_HEADER);
    expect(content).toContain('BACKLOG.md');
  });

  test('is a no-op when every OpenSpec entry is already present', async () => {
    const dir = await mkdtemp(join(ROOT, 'full-'));
    const body = [
      OPENSPEC_GITIGNORE_HEADER,
      ...OPENSPEC_GITIGNORE_ENTRIES,
      '',
    ].join('\n');
    await writeFile(join(dir, '.gitignore'), body, 'utf-8');
    const changed = await ensureOpenspecGitignore(dir);
    expect(changed).toBeNull();
    const content = await readFile(join(dir, '.gitignore'), 'utf-8');
    expect(content).toBe(body);
  });
});
