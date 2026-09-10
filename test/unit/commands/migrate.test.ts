import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findOrphanedPromptVersions,
  migrateCommand,
  migratePermissionRules,
} from '../../../src/commands/migrate.command';

let base: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'cc-migrate-'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

async function writeSettings(dir: string, settings: Record<string, unknown>): Promise<string> {
  const claudeDir = join(base, dir, '.claude');
  await mkdir(claudeDir, { recursive: true });
  const path = join(claudeDir, 'settings.json');
  await writeFile(path, JSON.stringify(settings, null, 2));
  return path;
}

describe('migratePermissionRules', () => {
  test('rewrites a Write(path) rule to Edit(path) — happy path', () => {
    const { settings, changes } = migratePermissionRules({
      permissions: { allow: ['Write(./src/**)', 'Bash(git status*)'] },
    });
    expect((settings.permissions as { allow: string[] }).allow).toEqual([
      'Edit(./src/**)',
      'Bash(git status*)',
    ]);
    expect(changes).toEqual([{ list: 'allow', from: 'Write(./src/**)', to: 'Edit(./src/**)' }]);
  });

  test('dedupes when both Write(path) and its Edit(path) equivalent already exist — edge case', () => {
    const { settings, duplicatesRemoved } = migratePermissionRules({
      permissions: { allow: ['Write(./app/**)', 'Edit(./app/**)'] },
    });
    expect((settings.permissions as { allow: string[] }).allow).toEqual(['Edit(./app/**)']);
    expect(duplicatesRemoved).toEqual(['Edit(./app/**)']);
  });

  test('leaves settings untouched when there is no permissions block — error/no-op case', () => {
    const input = { env: { FOO: '1' } };
    const { settings, changes, duplicatesRemoved } = migratePermissionRules(input);
    expect(settings).toEqual(input);
    expect(changes).toEqual([]);
    expect(duplicatesRemoved).toEqual([]);
  });

  test('covers allow, deny, and ask independently', () => {
    const { changes } = migratePermissionRules({
      permissions: {
        allow: ['Write(./a/**)'],
        deny: ['Write(./b/**)'],
        ask: ['Write(./c/**)'],
      },
    });
    expect(changes.map((c) => c.list).sort()).toEqual(['allow', 'ask', 'deny']);
  });
});

describe('migrateCommand', () => {
  test('happy path: rewrites and writes the file back', async () => {
    const settingsPath = await writeSettings('happy', {
      permissions: { allow: ['Write(./src/**)'] },
    });

    const result = await migrateCommand({
      projectRoot: join(base, 'happy'),
      global: false,
      dryRun: false,
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { changed: boolean; rewritten: unknown[] };
    expect(data.changed).toBe(true);
    expect(data.rewritten).toHaveLength(1);

    const onDisk = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(onDisk.permissions.allow).toEqual(['Edit(./src/**)']);
  });

  test('edge case: --dry-run reports changes without writing', async () => {
    const settingsPath = await writeSettings('dry-run', {
      permissions: { allow: ['Write(./src/**)'] },
    });

    const result = await migrateCommand({
      projectRoot: join(base, 'dry-run'),
      global: false,
      dryRun: true,
      output: 'json',
    });

    const data = result.data as { changed: boolean; dryRun: boolean };
    expect(data.changed).toBe(false);
    expect(data.dryRun).toBe(true);

    const onDisk = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(onDisk.permissions.allow).toEqual(['Write(./src/**)']);
  });

  test('edge case: nothing to migrate reports changed=false without writing', async () => {
    await writeSettings('clean', { permissions: { allow: ['Bash(git status*)'] } });

    const result = await migrateCommand({
      projectRoot: join(base, 'clean'),
      global: false,
      dryRun: false,
      output: 'json',
    });

    expect(result.code).toBe(0);
    expect((result.data as { changed: boolean }).changed).toBe(false);
  });

  test('edge case: missing settings.json is not an error — many projects never had one', async () => {
    const result = await migrateCommand({
      projectRoot: join(base, 'does-not-exist'),
      global: false,
      dryRun: false,
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { settingsFileFound: boolean; changed: boolean; message?: string };
    expect(data.settingsFileFound).toBe(false);
    expect(data.changed).toBe(false);
    expect(data.message).toContain('nothing to migrate');
  });

  test('error case: invalid JSON returns a non-zero code with a clear message', async () => {
    const claudeDir = join(base, 'bad-json', '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, 'settings.json'), '{ not valid json');

    const result = await migrateCommand({
      projectRoot: join(base, 'bad-json'),
      global: false,
      dryRun: false,
      output: 'json',
    });

    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors[0]).toContain('not valid JSON');
  });

  test('--file overrides the default settings.json path', async () => {
    const dir = join(base, 'custom-file');
    await mkdir(dir, { recursive: true });
    const customPath = join(dir, 'settings.local.json');
    await writeFile(customPath, JSON.stringify({ permissions: { allow: ['Write(./x/**)'] } }));

    const result = await migrateCommand({
      projectRoot: dir,
      global: false,
      dryRun: false,
      output: 'json',
      file: 'settings.local.json',
    });

    expect(result.code).toBe(0);
    expect((result.data as { file: string }).file).toBe(customPath);
    const onDisk = JSON.parse(await readFile(customPath, 'utf-8'));
    expect(onDisk.permissions.allow).toEqual(['Edit(./x/**)']);
  });
});

describe('findOrphanedPromptVersions / migrateCommand orphan cleanup', () => {
  test('happy path: an orphaned version dir is found and removed, current version untouched', async () => {
    const dir = join(base, 'orphan-happy');
    const orphanDir = join(dir, '.claude', 'prompts', 'v0.4.0');
    const currentDir = join(dir, '.claude', 'prompts', 'v1.0.0');
    await mkdir(orphanDir, { recursive: true });
    await mkdir(currentDir, { recursive: true });
    await writeFile(join(orphanDir, 'orchestrator.md'), 'old contract');
    await writeFile(join(currentDir, 'orchestrator.md'), 'current contract');

    const found = await findOrphanedPromptVersions(dir, false);
    expect(found).toEqual([{ target: 'claude', path: orphanDir, version: 'v0.4.0' }]);

    const result = await migrateCommand({
      projectRoot: dir,
      global: false,
      dryRun: false,
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as {
      orphanedPromptVersions: unknown[];
      orphanedPromptVersionsRemoved: boolean;
      changed: boolean;
    };
    expect(data.orphanedPromptVersions).toHaveLength(1);
    expect(data.orphanedPromptVersionsRemoved).toBe(true);
    expect(data.changed).toBe(true);

    const orphanStillExists = await readFile(join(orphanDir, 'orchestrator.md'), 'utf-8').then(
      () => true,
      () => false
    );
    expect(orphanStillExists).toBe(false);
    const currentStillExists = await readFile(join(currentDir, 'orchestrator.md'), 'utf-8').then(
      () => true,
      () => false
    );
    expect(currentStillExists).toBe(true);
  });

  test('edge case: --dry-run reports the orphan without deleting it', async () => {
    const dir = join(base, 'orphan-dry-run');
    const orphanDir = join(dir, '.claude', 'prompts', 'v0.3.0');
    await mkdir(orphanDir, { recursive: true });
    await writeFile(join(orphanDir, 'orchestrator.md'), 'old contract');

    const result = await migrateCommand({
      projectRoot: dir,
      global: false,
      dryRun: true,
      output: 'json',
    });

    const data = result.data as { orphanedPromptVersions: unknown[]; orphanedPromptVersionsRemoved: boolean };
    expect(data.orphanedPromptVersions).toHaveLength(1);
    expect(data.orphanedPromptVersionsRemoved).toBe(false);

    const stillExists = await readFile(join(orphanDir, 'orchestrator.md'), 'utf-8').then(
      () => true,
      () => false
    );
    expect(stillExists).toBe(true);
  });

  test('error case: a project with only the current version reports no orphans', async () => {
    const dir = join(base, 'orphan-clean');
    const currentDir = join(dir, '.claude', 'prompts', 'v1.0.0');
    await mkdir(currentDir, { recursive: true });
    await writeFile(join(currentDir, 'orchestrator.md'), 'current contract');

    const found = await findOrphanedPromptVersions(dir, false);
    expect(found).toEqual([]);

    const result = await migrateCommand({
      projectRoot: dir,
      global: false,
      dryRun: false,
      output: 'json',
    });
    const data = result.data as { orphanedPromptVersions: unknown[]; orphanedPromptVersionsRemoved: boolean };
    expect(data.orphanedPromptVersions).toEqual([]);
    expect(data.orphanedPromptVersionsRemoved).toBe(false);
  });

  test('a target with no prompts/ directory at all is skipped without error', async () => {
    const dir = join(base, 'orphan-no-prompts-dir');
    await mkdir(join(dir, '.claude'), { recursive: true }); // installed, but no prompts/ subdir yet

    const found = await findOrphanedPromptVersions(dir, false);
    expect(found).toEqual([]);
  });
});
