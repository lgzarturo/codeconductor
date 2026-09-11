#!/usr/bin/env bun
/**
 * Copy each canonical shared skill out to every target listed for it.
 * Source of truth: skills/<name>/SKILL.md
 * Manifest: src/presets/shared-skills.yml
 *
 * These are skills whose SKILL.md was verified byte-identical across every
 * target it appears in (see docs/harness-spec.md and CHANGELOG.md
 * [Unreleased]) — hand-editing a presets/<target>/skills/<name>/SKILL.md
 * copy directly would silently drift from the other targets again. Edit the
 * canonical file under skills/ and re-run this script instead.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

const ROOT = join(import.meta.dir, '..');

interface SharedSkillEntry {
  readonly name: string;
  readonly targets: readonly string[];
}

export function loadSharedSkills(): readonly SharedSkillEntry[] {
  const raw = readFileSync(join(ROOT, 'src/presets/shared-skills.yml'), 'utf-8');
  const data = parse(raw) as { skills: SharedSkillEntry[] };
  return data.skills;
}

export function syncAll(): number {
  let written = 0;
  for (const entry of loadSharedSkills()) {
    const canonicalPath = join(ROOT, 'skills', entry.name, 'SKILL.md');
    if (!existsSync(canonicalPath)) {
      console.warn('skip missing canonical skill', canonicalPath);
      continue;
    }
    const content = readFileSync(canonicalPath, 'utf-8');

    for (const target of entry.targets) {
      const dest = join(ROOT, 'presets', target, 'skills', entry.name, 'SKILL.md');
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
      written++;
    }
  }
  return written;
}

if (import.meta.main) {
  const written = syncAll();
  console.log(`Synced ${written} preset copies from ${loadSharedSkills().length} canonical shared skill(s)`);
}
