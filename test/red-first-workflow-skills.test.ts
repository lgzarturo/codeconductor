import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const FEATURE = join(ROOT, '.agents/skills/cc-feature/SKILL.md');
const FIX = join(ROOT, '.agents/skills/cc-fix/SKILL.md');

function headingIndex(content: string, needle: 'tester' | 'implementer'): number {
  const lines = content.split('\n');
  return lines.findIndex(
    (line) => line.startsWith('## ') && line.toLowerCase().includes(needle),
  );
}

function section(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

function nonEmptyLines(text: string): number {
  return text.split('\n').filter((line) => line.trim().length > 0).length;
}

// More than this many identical non-empty lines shared between the two skills
// counts as a duplicated block (P4: savings measured in deduplicated
// lines/blocks). Short shared references to one canonical source stay below it.
const DUPLICATE_THRESHOLD = 5;

describe('CA3 — cc-feature/cc-fix are RED-first', () => {
  test('cc-feature: tester step precedes implementer step', () => {
    const content = readFileSync(FEATURE, 'utf-8');
    const tester = headingIndex(content, 'tester');
    const implementer = headingIndex(content, 'implementer');
    expect(tester).toBeGreaterThanOrEqual(0);
    expect(implementer).toBeGreaterThanOrEqual(0);
    expect(tester).toBeLessThan(implementer);
  });

  test('cc-fix: tester step precedes implementer step', () => {
    const content = readFileSync(FIX, 'utf-8');
    const tester = headingIndex(content, 'tester');
    const implementer = headingIndex(content, 'implementer');
    expect(tester).toBeGreaterThanOrEqual(0);
    expect(implementer).toBeGreaterThanOrEqual(0);
    expect(tester).toBeLessThan(implementer);
  });
});

describe('CA8 — zero duplicated STOP/scope blocks in cc-feature/cc-fix', () => {
  for (const heading of ['## Web interface scope', '## Android phone interface scope']) {
    test(`${heading} is not duplicated verbatim in both skills`, () => {
      const inFeature = section(readFileSync(FEATURE, 'utf-8'), heading);
      const inFix = section(readFileSync(FIX, 'utf-8'), heading);
      const duplicated =
        inFeature.length > 0 &&
        inFeature === inFix &&
        nonEmptyLines(inFeature) > DUPLICATE_THRESHOLD;
      expect(duplicated).toBe(false);
    });
  }
});
