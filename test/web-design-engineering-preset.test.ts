import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { copyFromManifest } from '../src/core/presets/file-copier';
import { loadManifest } from '../src/core/presets/manifest-loader';

const ROOT = resolve(import.meta.dir, '..');
const SKILL = 'web-design-engineering';
const RUNNERS = ['claude', 'codex', 'cursor', 'opencode', 'agy', 'gemini', 'pi'] as const;

describe('web design engineering distribution', () => {
  test('registers the initial skill version', async () => {
    const registry = JSON.parse(await readFile(join(ROOT, 'skills-registry.json'), 'utf-8'));
    expect(registry.skills[SKILL].version).toBe('1.0.0');
  });

  for (const runner of RUNNERS) {
    test(`${runner} installs the canonical skill and resolves workflow references`, async () => {
      const dir = await mkdtemp(join(tmpdir(), `cc-web-design-${runner}-`));
      try {
        const manifest = await loadManifest(runner);
        const results = await copyFromManifest(
          manifest, join(ROOT, 'presets'), dir, false, false, false,
        );
        expect(results.filter((result) => result.action === 'error')).toEqual([]);

        const skillEntry = manifest.entries.find((entry) => entry.dest.endsWith('/skills'));
        expect(skillEntry).toBeDefined();
        const installed = await readFile(join(dir, skillEntry!.dest, SKILL, 'SKILL.md'), 'utf-8');
        const canonical = await readFile(join(ROOT, 'skills', SKILL, 'SKILL.md'), 'utf-8');
        expect(installed).toBe(canonical);
        const frontmatter = installed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        expect(frontmatter).not.toBeNull();
        const metadata = parse(frontmatter![1]);
        expect(metadata.name).toBe(SKILL);
        expect(typeof metadata.description).toBe('string');
        expect(metadata.description.trim().length).toBeGreaterThan(0);

        for (const workflow of ['feature', 'fix', 'review', 'openspec']) {
          const candidates = results.filter((result) =>
            result.dest.endsWith(`/cc-${workflow}/SKILL.md`)
            || result.dest.endsWith(`/cc-${workflow}.md`)
            || result.dest.endsWith(`/cc/${workflow}.md`)
            || result.dest.endsWith(`/cc/${workflow}.toml`),
          );
          expect(candidates.length, `${runner}: ${workflow} workflow installed`).toBeGreaterThan(0);
          for (const candidate of candidates) {
            expect(await readFile(candidate.dest, 'utf-8'), candidate.dest).toContain(SKILL);
          }
        }
        const guidance = await readFile(join(dir, skillEntry!.dest, 'using-cc-skills', 'SKILL.md'), 'utf-8');
        expect(guidance).toContain(SKILL);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
});
