/**
 * Regression test: SKILL.md frontmatter should not contain version field.
 * Skill versions are now centralized in skills-registry.json, not in individual SKILL.md files.
 */
import { describe, expect, test } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../..');

async function findSkillFiles(): Promise<string[]> {
  const files: string[] = [];

  // Find all SKILL.md files under presets/*/skills/*/
  const presetsDir = join(ROOT, 'presets');
  try {
    const presetNames = await readdir(presetsDir);
    for (const presetName of presetNames) {
      const skillsDir = join(presetsDir, presetName, 'skills');
      try {
        const skillNames = await readdir(skillsDir);
        for (const skillName of skillNames) {
          const skillFile = join(skillsDir, skillName, 'SKILL.md');
          files.push(skillFile);
        }
      } catch {
        // skills directory may not exist for this preset
      }
    }
  } catch {
    // presets directory doesn't exist
  }

  // Find all SKILL.md files under skills/*/
  const skillsDir = join(ROOT, 'skills');
  try {
    const skillNames = await readdir(skillsDir);
    for (const skillName of skillNames) {
      const skillFile = join(skillsDir, skillName, 'SKILL.md');
      files.push(skillFile);
    }
  } catch {
    // skills directory doesn't exist
  }

  return files;
}

describe('SKILL.md regression: no version field in frontmatter', () => {
  test('no SKILL.md files under presets/*/skills/*/ or skills/*/ contain version: in frontmatter', async () => {
    const skillFiles = await findSkillFiles();

    const filesWithVersionField: string[] = [];

    for (const filePath of skillFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');

        // Extract frontmatter block (between first and second ---)
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!frontmatterMatch) {
          continue; // No frontmatter, skip
        }

        const frontmatter = frontmatterMatch[1];

        // Check if frontmatter contains top-level "version:" field
        if (/^version\s*:/m.test(frontmatter)) {
          filesWithVersionField.push(filePath);
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    expect(filesWithVersionField).toEqual(
      [],
      `Found ${filesWithVersionField.length} SKILL.md file(s) with version field in frontmatter:\n${filesWithVersionField.join(
        '\n'
      )}\nVersion should only be in skills-registry.json, not in individual SKILL.md files.`
    );
  });

  test('regex matches top-level version field but ignores nested version keys', () => {
    const withTopLevel = '---\nname: foo\nversion: 1.0.0\n---\n# Foo';
    const withNested = '---\nname: foo\nquality:\n  version: 0.1.0\n---\n# Foo';

    const matchTopLevel = withTopLevel.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const matchNested = withNested.match(/^---\r?\n([\s\S]*?)\r?\n---/);

    expect(/^version\s*:/m.test(matchTopLevel![1])).toBe(true);
    expect(/^version\s*:/m.test(matchNested![1])).toBe(false);
  });
});
