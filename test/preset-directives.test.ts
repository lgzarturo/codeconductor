import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * AC2 — Each preset's generated context file must include both an
 * explicit YAGNI directive and an explicit stdlib-first directive.
 *
 * The "generated AGENTS.md context" in this project is the preset
 * instruction file checked into the repo. The test reads each file
 * directly and asserts both directives are present.
 */

const REPO_ROOT = join(import.meta.dir, '..');

interface PresetContext {
  readonly label: string;
  readonly path: string;
}

const PRESET_CONTEXTS: readonly PresetContext[] = [
  { label: 'root AGENTS.md', path: 'AGENTS.md' },
  { label: 'root CLAUDE.md', path: 'CLAUDE.md' },
  { label: 'presets/claude/CLAUDE.md', path: 'presets/claude/CLAUDE.md' },
  { label: 'presets/codex/AGENTS.md', path: 'presets/codex/AGENTS.md' },
  { label: 'presets/agy/AGENTS.md', path: 'presets/agy/AGENTS.md' },
  { label: 'presets/opencode/README.md', path: 'presets/opencode/README.md' },
];

const YAGNI_PATTERNS = [
  /\bYAGNI\b/i,
  /You Aren'?t Gonna Need It/i,
  /not\s+explicitly\s+requested/i,
];

const STDLIB_PATTERNS = [
  /stdlib[- ]?first/i,
  /standard\s+library/i,
  /\bnode:fs\b/,
  /\bnode:path\b/,
];

async function readContext(relPath: string): Promise<string> {
  return await readFile(join(REPO_ROOT, relPath), 'utf-8');
}

function containsAny(content: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(content));
}

describe('Phase 1 AC2 — preset context files include YAGNI and stdlib-first', () => {
  for (const ctx of PRESET_CONTEXTS) {
    test(`${ctx.label} declares an explicit YAGNI directive`, async () => {
      const content = await readContext(ctx.path);
      expect(containsAny(content, YAGNI_PATTERNS)).toBe(true);
    });

    test(`${ctx.label} declares an explicit stdlib-first directive`, async () => {
      const content = await readContext(ctx.path);
      expect(containsAny(content, STDLIB_PATTERNS)).toBe(true);
    });
  }
});

describe('Phase 1 AC2 — each preset pair has matching directive structure', () => {
  test('all preset context files share a YAGNI section title casing', async () => {
    for (const ctx of PRESET_CONTEXTS) {
      const content = await readContext(ctx.path);
      // The YAGNI section must be a heading, not a one-off mention
      expect(content).toMatch(/^#{2,4}\s+(?:###?\s+)?YAGNI/m);
    }
  });

  test('all preset context files share a stdlib-first section heading', async () => {
    for (const ctx of PRESET_CONTEXTS) {
      const content = await readContext(ctx.path);
      expect(content).toMatch(/^#{2,4}\s+(?:###?\s+)?Stdlib[-\s]?First/m);
    }
  });
});
