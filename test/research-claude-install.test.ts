import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { copyFromManifest } from '../src/core/presets/file-copier';
import { loadManifest } from '../src/core/presets/manifest-loader';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function installSettings(existing?: string) {
  const root = await mkdtemp(join(tmpdir(), 'cc-claude-research-'));
  roots.push(root);
  await mkdir(join(root, '.claude'));
  const dest = join(root, '.claude/settings.json');
  if (existing !== undefined) await writeFile(dest, existing);
  const manifest = await loadManifest('claude');
  const settingsManifest = { ...manifest, entries: manifest.entries.filter(entry => entry.src === 'claude/settings.json') };
  const apply = () => copyFromManifest(settingsManifest, resolve('presets'), root, false, false, true);
  return { dest, apply, results: await apply() };
}

test('Claude installation preserves user preferences and requires permission for arbitrary execution and network', async () => {
  const user = { model: 'user-model', language: 'english', env: { USER_OPTION: 'keep' }, enabledPlugins: { 'user-plugin': true } };
  const { dest, apply } = await installSettings(JSON.stringify(user));
  const first = await readFile(dest, 'utf8');
  const settings = JSON.parse(first);
  for (const [key, value] of Object.entries(user)) expect(settings[key]).toEqual(value);
  expect(settings.permissions.allow).toEqual(['Read(**)', 'Edit(**)']);
  expect(settings.permissions.ask).toContain('WebFetch(*)');
  expect(settings.extraKnownMarketplaces).toBeUndefined();
  await apply();
  expect(await readFile(dest, 'utf8')).toBe(first);
});

test('installation rejects invalid existing settings without destroying them', async () => {
  const { dest, results } = await installSettings('{ broken');
  expect(results[0]?.action).toBe('error');
  expect(await readFile(dest, 'utf8')).toBe('{ broken');
});

test('installation makes inherited broad permissions visible without removing user rules', async () => {
  const { dest, results } = await installSettings(JSON.stringify({ permissions: { allow: ['Bash(npx *)', 'WebFetch(*)'] } }));
  const settings = JSON.parse(await readFile(dest, 'utf8'));
  expect(settings.permissions.allow).toContain('Bash(npx *)');
  expect(settings.permissions.allow).toContain('WebFetch(*)');
  expect(results[0]?.warnings?.join('\n')).toContain('Bash(npx *)');
  expect(results[0]?.warnings?.join('\n')).toContain('WebFetch(*)');
});

test('installation reports wildcard and legacy broad permission syntax', async () => {
  const rules = ['Bash(*)', 'Bash(bun *)', 'Bash(python3:*)', 'WebFetch'];
  const { results } = await installSettings(JSON.stringify({ permissions: { allow: rules } }));
  for (const rule of rules) expect(results[0]?.warnings?.join('\n')).toContain(rule);
});
