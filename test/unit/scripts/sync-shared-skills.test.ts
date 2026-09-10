import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadSharedSkills } from '../../../scripts/sync-shared-skills';

const ROOT = resolve(import.meta.dir, '../../..');

describe('shared-skills.yml', () => {
  const entries = loadSharedSkills();

  test('lists at least one shared skill', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test('every entry has 2+ targets — a single-target entry cannot be "shared"', () => {
    for (const entry of entries) {
      expect(entry.targets.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('every canonical skills/<name>/SKILL.md exists', () => {
    for (const entry of entries) {
      const path = join(ROOT, 'skills', entry.name, 'SKILL.md');
      expect(existsSync(path)).toBe(true);
    }
  });

  test('every presets/<target>/skills/<name>/SKILL.md matches its canonical source byte-for-byte', () => {
    for (const entry of entries) {
      const canonical = readFileSync(join(ROOT, 'skills', entry.name, 'SKILL.md'), 'utf-8');
      for (const target of entry.targets) {
        const targetPath = join(ROOT, 'presets', target, 'skills', entry.name, 'SKILL.md');
        expect(existsSync(targetPath)).toBe(true);
        expect(readFileSync(targetPath, 'utf-8')).toBe(canonical);
      }
    }
  });
});
