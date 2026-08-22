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
  test('Step 1 names the ConfirmationGate instead of generic wait-for-human prose', async () => {
    const content = await readFile(
      resolve(PROMPTS_V100, '../../../claude/commands/cc/feature.md'),
      'utf-8',
    );
    const step1 = content.slice(
      content.indexOf('## Step 1'),
      content.indexOf('## Step 2'),
    );
    expect(step1).toContain('ConfirmationGate');
    expect(step1).toMatch(/questionsForUser|needsConfirmation/);
  });
});
