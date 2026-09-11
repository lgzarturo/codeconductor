import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadManifest } from '../../src/core/presets/manifest-loader';

const ROOT = resolve(import.meta.dir, '../..');

describe('Gemini preset parity', () => {
  test('manifest copies the full opencode skill set, not a 4-skill cherry-pick', async () => {
    const manifest = await loadManifest('gemini');
    const skillsEntry = manifest.entries.find((e) => e.dest === '.gemini/skills');
    expect(skillsEntry).toBeDefined();
    expect(skillsEntry?.src).toBe('opencode/skills');

    // The old manifest cherry-picked exactly these 4 individual skill
    // directories instead of the shared skills/ tree — confirm that
    // narrower shape is gone, not just that a new entry was added alongside it.
    const cherryPicked = manifest.entries.filter((e) =>
      /^\.gemini\/skills\/[a-z-]+$/.test(e.dest)
    );
    expect(cherryPicked).toEqual([]);
  });

  test('manifest ships a GEMINI.md context file and a settings.json', async () => {
    const manifest = await loadManifest('gemini');
    const contextEntry = manifest.entries.find((e) => e.dest === 'GEMINI.md');
    expect(contextEntry).toBeDefined();
    expect(contextEntry?.strategy).toBe('merge-managed');

    const settingsEntry = manifest.entries.find((e) => e.dest === '.gemini/settings.json');
    expect(settingsEntry).toBeDefined();
  });

  test('the source files the manifest points at actually exist', () => {
    expect(existsSync(resolve(ROOT, 'presets/gemini/GEMINI.md'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'presets/gemini/settings.json'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'presets/opencode/skills'))).toBe(true);
  });
});
