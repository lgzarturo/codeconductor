import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { hasTriggerLanguage, parseSkillFrontmatter } from '../../../../src/core/presets/skill-frontmatter';
import { loadSharedSkills } from '../../../../scripts/sync-shared-skills';

const ROOT = resolve(import.meta.dir, '../../../..');
const TARGETS = ['claude', 'codex', 'cursor', 'opencode', 'agy'];
/** Official repo method (d3-token-audit): tokens ≈ bytes / 4. An estimate, not a tokenizer. */
const SKILLS = [
  { id: 'rust-engineering', maxBytes: 6000 },
  { id: 'rust-async', maxBytes: 4000 },
  { id: 'rust-sqlx', maxBytes: 4000 },
  { id: 'database-migrations', maxBytes: 4000 },
];
const SECTIONS = ['Activation', 'Inputs', 'Procedure', 'Decisions and exceptions', 'Evidence', 'References'];

const read = (id: string): string => readFileSync(join(ROOT, 'skills', id, 'SKILL.md'), 'utf-8');

describe.each(SKILLS)('skill $id', ({ id, maxBytes }) => {
  test('existe la fuente canónica', () => {
    expect(existsSync(join(ROOT, 'skills', id, 'SKILL.md'))).toBe(true);
  });

  test('frontmatter válido, id == directorio y solo id/name/description con Trigger', () => {
    const content = read(id);
    const parsed = parseSkillFrontmatter(content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frontmatter.id).toBe(id);
    expect(parsed.frontmatter.name).toBe(id);
    expect(hasTriggerLanguage(parsed.frontmatter)).toBe(true);
    const raw = parse(content.match(/^---\r?\n([\s\S]*?)\r?\n---/)![1]!) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(['description', 'id', 'name']);
  });

  test('contiene las seis secciones en orden', () => {
    const headings = [...read(id).matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(SECTIONS);
  });

  test(`pesa como máximo ${maxBytes} bytes (≈ ${maxBytes / 4} tokens, bytes/4)`, () => {
    expect(Buffer.byteLength(read(id), 'utf-8')).toBeLessThanOrEqual(maxBytes);
  });

  test('está registrada en los cinco targets', () => {
    const entry = loadSharedSkills().find((e) => e.name === id);
    expect([...(entry?.targets ?? [])].sort()).toEqual([...TARGETS].sort());
  });
});
