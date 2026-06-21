import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { loadManifest, loadModelConfig } from '../src/core/presets/manifest-loader';

const PROJECT_ROOT = resolve(import.meta.dir, '..');

function readPreset(relativePath: string): string {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Preset file not found: ${relativePath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

describe('Antigravity CLI (agy) Preset — file existence', () => {
  const expectedPaths = [
    'presets/agy/README.md',
    'presets/agy/AGENTS.md',
    'presets/agy/rules/commit-style.md',
    'presets/agy/rules/graphify.md',
    'presets/agy/workflows/cc-feature.md',
    'presets/agy/workflows/cc-fix.md',
    'presets/agy/workflows/cc-refactor.md',
    'presets/agy/workflows/cc-review.md',
    'presets/agy/workflows/cc-test-plan.md',
    'presets/agy/workflows/cc-tdd-cycle.md',
    'presets/agy/workflows/cc-api-contract.md',
    'presets/agy/workflows/cc-db-migration.md',
    'presets/agy/workflows/cc-pagespeed.md',
    'presets/agy/settings.json',
    'presets/agy/hooks.json',
    'presets/agy/mcp_config.json',
    'presets/agy/scripts/pre-tool.sh',
    'presets/agy/scripts/post-tool.sh',
    'presets/agy/skills/cc-feature/SKILL.md',
    'presets/agy/skills/cc-fix/SKILL.md',
    'presets/agy/skills/cc-refactor/SKILL.md',
    'presets/agy/skills/cc-review/SKILL.md',
    'presets/agy/skills/cc-test-plan/SKILL.md',
    'presets/agy/skills/cc-tdd-cycle/SKILL.md',
    'presets/agy/skills/cc-api-contract/SKILL.md',
    'presets/agy/skills/cc-db-migration/SKILL.md',
    'presets/agy/skills/cc-pagespeed/SKILL.md',
    'presets/agy/skills/commit/SKILL.md',
  ];

  for (const p of expectedPaths) {
    test(`${p} exists`, () => {
      expect(existsSync(join(PROJECT_ROOT, p))).toBe(true);
    });
  }
});

describe('Antigravity CLI (agy) Preset — AGENTS.md content', () => {
  test('contains managed block markers', () => {
    const content = readPreset('presets/agy/AGENTS.md');
    expect(content).toContain('<!-- CODECONDUCTOR:BEGIN managed -->');
    expect(content).toContain('<!-- CODECONDUCTOR:END managed -->');
  });

  test('defines Conductor Agent roles', () => {
    const content = readPreset('presets/agy/AGENTS.md');
    expect(content).toContain('### orchestrator');
    expect(content).toContain('### task-coach');
    expect(content).toContain('### architect');
    expect(content).toContain('### implementer');
    expect(content).toContain('### tester');
    expect(content).toContain('### reviewer');
    expect(content).toContain('### docs');
    expect(content).toContain('### repo-explorer');
  });

  test('references MODEL_GEMINI placeholder', () => {
    const content = readPreset('presets/agy/AGENTS.md');
    expect(content).toContain('{{MODEL_GEMINI}}');
  });
});

describe('Antigravity CLI (agy) Manifest and Model Config', () => {
  test('manifest loads successfully and contains correct entries', async () => {
    const manifest = await loadManifest('agy');
    expect(manifest.target).toBe('agy');
    
    const srcDirs = manifest.entries.map(e => e.src);
    expect(srcDirs).toContain('agy/AGENTS.md');
    expect(srcDirs).toContain('agy/rules');
    expect(srcDirs).toContain('agy/workflows');
    expect(srcDirs).toContain('agy/settings.json');
    expect(srcDirs).toContain('agy/hooks.json');
    expect(srcDirs).toContain('agy/mcp_config.json');
    expect(srcDirs).toContain('agy/scripts');
    expect(srcDirs).toContain('opencode/skills');
    expect(srcDirs).toContain('agy/skills');
    expect(srcDirs).toContain('opencode/agents');
    expect(srcDirs).toContain('opencode/prompts/v0.3.0');

    const destDirs = manifest.entries.map(e => e.dest);
    expect(destDirs).toContain('.agents/AGENTS.md');
    expect(destDirs).toContain('.agents/rules');
    expect(destDirs).toContain('.agents/workflows');
    expect(destDirs).toContain('.agents/../antigravity-cli/settings.json');
    expect(destDirs).toContain('.agents/hooks.json');
    expect(destDirs).toContain('.agents/mcp_config.json');
    expect(destDirs).toContain('.agents/scripts');
    expect(destDirs).toContain('.agents/skills');
    expect(destDirs).toContain('.agents/agents');
    expect(destDirs).toContain('.agents/prompts/v0.3.0');
  });

  test('model config loads successfully and contains tools mapping', async () => {
    const config = await loadModelConfig('agy');
    expect(config.target).toBe('agy');
    expect(config.tools).toBeDefined();
    
    const tools = config.tools!;
    expect(tools.Read.agy).toBe('view_file');
    expect(tools.Write.agy).toBe('write_to_file');
    expect(tools.Edit.agy).toBe('replace_file_content / multi_replace_file_content');
    expect(tools.Bash.agy).toBe('run_command');
    expect(tools.Glob.agy).toBe('list_dir');
    expect(tools.Grep.agy).toBe('grep_search');
    expect(tools.WebFetch.agy).toBe('read_url_content / read_browser_page');
  });
});
