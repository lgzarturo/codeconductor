import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PROMPTS_V100 = resolve(import.meta.dir, '../presets/opencode/prompts/v1.0.0');
const AGENTS_ACTIVE = resolve(import.meta.dir, '../presets/opencode/agents');

function bodyAfterFrontmatter(content: string): string {
  return content.slice(content.indexOf('# Agent Contract'));
}

describe('prompt contracts v1.0.0 — task-coach grilling protocol (BC-007)', () => {
  test('task-coach stress-tests assumptions before the Task Card is ready', async () => {
    const content = await readFile(resolve(PROMPTS_V100, 'task-coach.md'), 'utf-8');
    expect(content).toContain('Grilling protocol');
    expect(content).toContain('stress-test');
  });

  test('task-coach CCEP-1 rules route unresolved grill questions through questionsForUser', async () => {
    const content = await readFile(resolve(PROMPTS_V100, 'task-coach.md'), 'utf-8');
    const ccepSection = content.slice(content.indexOf('## CCEP-1 structured output'));
    expect(ccepSection.toLowerCase()).toContain('grill');
    expect(ccepSection).toContain('questionsForUser');
  });

  test('active task-coach agent copy keeps the same body as the v1.0.0 contract', async () => {
    const versioned = await readFile(resolve(PROMPTS_V100, 'task-coach.md'), 'utf-8');
    const active = await readFile(resolve(AGENTS_ACTIVE, 'task-coach.md'), 'utf-8');
    expect(bodyAfterFrontmatter(active)).toBe(bodyAfterFrontmatter(versioned));
  });
});

describe('presets/claude/commands/cc/feature.md — ConfirmationGate wiring (BC-007)', () => {
  test('Task Card validation step names the ConfirmationGate instead of generic wait-for-human prose', async () => {
    const content = await readFile(
      resolve(PROMPTS_V100, '../../../claude/commands/cc/feature.md'),
      'utf-8',
    );
    const step2 = content.slice(
      content.indexOf('## Step 2'),
      content.indexOf('## Step 3'),
    );
    expect(step2).toContain('ConfirmationGate');
    expect(step2).toMatch(/questionsForUser|needsConfirmation/);
  });
});

describe('prompt contracts v1.0.0 — OpenCode runtime frontmatter', () => {
  test('each agent prompt has valid YAML frontmatter then Model Selection', async () => {
    const { parse } = await import('yaml');
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(PROMPTS_V100)).filter((f) => f.endsWith('.md') && f !== 'README.md');
    expect(files).toHaveLength(14);
    for (const file of files) {
      const content = await readFile(resolve(PROMPTS_V100, file), 'utf-8');
      expect(content.startsWith('---\n')).toBe(true);
      const close = content.indexOf('\n---\n', 4);
      expect(close).toBeGreaterThan(4);
      const fm = parse(content.slice(4, close)) as Record<string, unknown>;
      expect(typeof fm.name).toBe('string');
      expect(['low', 'medium', 'high']).toContain(fm.effort);
      expect(fm.model).toBe('{{MODEL}}');
      expect(fm.mode).toMatch(/^(primary|subagent)$/);
      const after = content.slice(close + '\n---\n'.length);
      expect(after).toContain('# Model Selection');
      expect(after).toContain('{{MODEL_GROK}}');
      expect(after).toContain('# Agent Contract');
      expect(content.slice(0, close)).not.toContain('# Model Selection');
    }
  });
});
