import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { diffPromptVersions } from '../src/core/evaluation/prompt-diff';

const PROMPTS_V050 = resolve(import.meta.dir, '../presets/opencode/prompts/v0.5.0');

describe('prompt contracts v0.5.0', () => {
  test('v0.5.0 directory has 12 prompt files', async () => {
    const files = await readdir(PROMPTS_V050);
    const md = files.filter((f) => f.endsWith('.md'));
    expect(md.length).toBe(12);
    expect(md).toContain('security-reviewer.md');
    expect(md).toContain('goal-planner.md');
    expect(md).toContain('contract-builder.md');
  });

  test('orchestrator contract header is v0.5.0', async () => {
    const content = await Bun.file(join(PROMPTS_V050, 'orchestrator.md')).text();
    expect(content).toContain('# Agent Contract — orchestrator v0.5.0');
    expect(content).toContain('Evaluation Gate (v0.5.0)');
    expect(content).toContain('{{MODEL_GROK}}');
    expect(content).toContain('/clear');
    expect(content).not.toContain('/new');
  });

  test('prompt-diff detects changes from v0.4.0 to v0.5.0', async () => {
    const diff = await diffPromptVersions('0.4.0', '0.5.0', { agent: 'orchestrator' });
    expect(diff.toVersion).toBe('v0.5.0');
    expect(diff.files.some((f) => f.path === 'orchestrator.md' && f.changed)).toBe(true);
  });

  test('prompt-diff lists new agent files', async () => {
    const diff = await diffPromptVersions('0.4.0', '0.5.0');
    const names = diff.files.map((f) => f.path);
    expect(names).toContain('security-reviewer.md');
    expect(names).toContain('goal-planner.md');
    expect(names).toContain('contract-builder.md');
  });
});
