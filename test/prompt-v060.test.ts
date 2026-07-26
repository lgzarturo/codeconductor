import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PROMPTS_V060 = resolve(import.meta.dir, '../presets/opencode/prompts/v0.6.0');

describe('prompt contracts v0.6.0', () => {
  test('planner, implementer, and reviewer require JSON output', async () => {
    for (const agent of ['planner', 'implementer', 'reviewer'] as const) {
      const content = await readFile(resolve(PROMPTS_V060, `${agent}.md`), 'utf-8');
      expect(content).toContain('v0.6.0');
      expect(content).toContain('valid JSON only');
      expect(content).toContain('Output contract');
    }
  });

  test('implementer references ImplementerOutputSchema', async () => {
    const content = await readFile(resolve(PROMPTS_V060, 'implementer.md'), 'utf-8');
    expect(content).toContain('ImplementerOutputSchema');
    expect(content).toContain('filesChanged');
  });

  test('reviewer references ReviewerOutputSchema', async () => {
    const content = await readFile(resolve(PROMPTS_V060, 'reviewer.md'), 'utf-8');
    expect(content).toContain('ReviewerOutputSchema');
    expect(content).toContain('findings');
  });
});
