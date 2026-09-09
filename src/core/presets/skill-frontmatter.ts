import { parse } from 'yaml';
import { SkillFrontmatterSchema, type SkillFrontmatter } from '../../validation/schemas';

export interface SkillFrontmatterError {
  readonly kind: 'missing' | 'invalid-yaml' | 'schema';
  readonly message: string;
}

export type SkillFrontmatterResult =
  | { readonly ok: true; readonly frontmatter: SkillFrontmatter }
  | { readonly ok: false; readonly error: SkillFrontmatterError };

/**
 * Parse and validate a SKILL.md's frontmatter block against
 * SkillFrontmatterSchema. Shared by the frontmatter-parity test and
 * `cc doctor` so both apply the exact same rule.
 */
export function parseSkillFrontmatter(content: string): SkillFrontmatterResult {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    return { ok: false, error: { kind: 'missing', message: 'No YAML frontmatter fence found' } };
  }

  let parsed: unknown;
  try {
    parsed = parse(fmMatch[1]);
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'invalid-yaml', message: e instanceof Error ? e.message : String(e) },
    };
  }

  const result = SkillFrontmatterSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
      },
    };
  }

  return { ok: true, frontmatter: result.data };
}

/**
 * A skill's canonical identifier is `id` when present (the extended
 * frontmatter form uses a human-readable `name` alongside a kebab-case
 * `id`), otherwise `name` itself (the bare `{name, description}` form).
 */
export function skillIdentifier(frontmatter: SkillFrontmatter): string {
  return frontmatter.id ?? frontmatter.name;
}

/** "Use when...", "Trigger:", or "when to use" — a description without one never auto-triggers. */
const TRIGGER_PATTERN = /use when|trigger:|when to use/i;

export function hasTriggerLanguage(frontmatter: SkillFrontmatter): boolean {
  return TRIGGER_PATTERN.test(frontmatter.description);
}
