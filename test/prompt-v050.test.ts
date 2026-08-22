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

  test('opencode agents reflect the active v1.0.0 contracts', async () => {
    const agentsDir = resolve(import.meta.dir, '../presets/opencode/agents');
    for (const file of ['security-reviewer.md', 'goal-planner.md', 'contract-builder.md']) {
      const content = await Bun.file(join(agentsDir, file)).text();
      expect(content).toContain('v1.0.0');
    }
  });

  test('renderTemplate replaces MODEL_GROK for cursor install', async () => {
    const { renderTemplate } = await import('../src/core/presets/file-copier');
    const { loadModelConfig } = await import('../src/core/presets/manifest-loader');
    const modelConfig = await loadModelConfig('cursor');
    const raw = await Bun.file(join(PROMPTS_V050, 'architect.md')).text();
    const rendered = renderTemplate(raw, modelConfig, 'architect.md');
    expect(rendered).toContain('cursor-grok-4.6-high-fast');
    expect(rendered).not.toContain('{{MODEL_GROK}}');
  });

  test('renderTemplate replaces placeholders for goal-planner and contract-builder', async () => {
    const { renderTemplate } = await import('../src/core/presets/file-copier');
    const { loadModelConfig } = await import('../src/core/presets/manifest-loader');
    const modelConfig = await loadModelConfig('cursor');
    const goalPlanner = renderTemplate(
      await Bun.file(join(PROMPTS_V050, 'goal-planner.md')).text(),
      modelConfig,
      'goal-planner.md'
    );
    expect(goalPlanner).not.toContain('{{MODEL');
    expect(goalPlanner).toContain('claude-4.5-haiku-thinking');

    const contractBuilder = renderTemplate(
      await Bun.file(join(PROMPTS_V050, 'contract-builder.md')).text(),
      modelConfig,
      'contract-builder.md'
    );
    expect(contractBuilder).not.toContain('{{MODEL');
    expect(contractBuilder).toContain('claude-sonnet-5-thinking-high');
  });

  test('codex AGENTS.md includes contract-builder and DDD→SDD→TDD routing', async () => {
    const content = await Bun.file(
      resolve(import.meta.dir, '../presets/codex/AGENTS.md')
    ).text();
    expect(content).toMatch(/^###\s+contract-builder/m);
    expect(content).toMatch(
      /\|\s*DDD[→\-]>?SDD[→\-]>?TDD[^|]*\|[^|]*\|[^|]*contract-builder[^|]*architect[^|]*tester[^|]*implementer/i
    );
  });

  test('v0.5.0 orchestrator high-risk route omits Council suffix', async () => {
    const content = await Bun.file(join(PROMPTS_V050, 'orchestrator.md')).text();
    expect(content).toContain('security-reviewer` → `reviewer`');
    expect(content).not.toContain('(Council)');
  });
});
