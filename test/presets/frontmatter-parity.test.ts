import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  hasTriggerLanguage,
  parseSkillFrontmatter,
  skillIdentifier,
} from '../../src/core/presets/skill-frontmatter';

const ROOT = resolve(import.meta.dir, '../..');

/**
 * Template placeholders are substituted at install/render time (see
 * COMMIT_WORKFLOW in src/core/i18n/language-instructions.ts) — the raw
 * preset source has no frontmatter of its own by design. Every rendered copy
 * that actually ships (e.g. .agents/skills/commit/SKILL.md) is still
 * validated below like any other skill.
 */
const TEMPLATE_PLACEHOLDERS = new Set(['presets/agy/skills/commit/SKILL.md']);

/** Every SKILL.md in the repo: preset sources plus the dogfooded installed copies (.agents/.cursor/.gemini). */
async function findSkillFiles(): Promise<string[]> {
  const glob = new Bun.Glob('**/SKILL.md');
  const files: string[] = [];
  for await (const f of glob.scan({ cwd: ROOT, dot: true })) {
    files.push(f.replace(/\\/g, '/'));
  }
  return files.sort();
}

describe('SKILL.md frontmatter parity (every shipped skill)', () => {
  test('every SKILL.md has valid frontmatter, a real identifier, and a bounded description', async () => {
    const files = await findSkillFiles();
    // Sanity check on the glob itself — a scan that silently returned zero
    // files would make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(100);

    const failures: string[] = [];
    let triggerless = 0;
    let checked = 0;

    for (const rel of files) {
      if (TEMPLATE_PLACEHOLDERS.has(rel)) continue;
      checked++;

      const content = await readFile(join(ROOT, rel), 'utf-8');
      const result = parseSkillFrontmatter(content);
      if (!result.ok) {
        failures.push(`${rel}: ${result.error.kind} — ${result.error.message}`);
        continue;
      }

      // This is exactly the assertion class that would have caught a
      // description silently truncated or falling back to a generic string:
      // it fails loudly instead of shipping a skill nothing can discover.
      const dir = basename(dirname(rel));
      const ident = skillIdentifier(result.frontmatter);
      if (ident !== dir) {
        failures.push(`${rel}: identifier "${ident}" does not match its directory "${dir}"`);
      }

      if (!hasTriggerLanguage(result.frontmatter)) triggerless++;
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} skill(s) failed frontmatter validation:\n${failures.join('\n')}`
      );
    }

    // Informational only — not gated. Many existing skills describe their
    // domain without the literal phrase "Use when…"/"Trigger:"; that's a
    // content-quality backlog item, not a defect this test exists to block.
    console.log(
      `frontmatter-parity: ${triggerless}/${checked} skills lack explicit trigger language ("Use when…"/"Trigger:")`
    );
  });
});
