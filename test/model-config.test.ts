import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { copyFromManifest } from '../src/core/presets/file-copier';
import { loadManifest, loadModelConfig } from '../src/core/presets/manifest-loader';
import { ModelConfigSchema } from '../src/validation/schemas';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const CLI_CMD = ['bun', 'run', 'src/cli/main.ts'];
const PRESETS_DIR = resolve(PROJECT_ROOT, 'presets');

async function runCli(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { spawn } = await import('bun');
  const process = spawn({
    cmd: [...CLI_CMD, ...args],
    cwd: PROJECT_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  const exitCode = await process.exited;
  return { exitCode, stdout, stderr };
}

async function cleanup() {
  for (const dir of ['.opencode', '.claude', '.codex', '.gemini', '.cursor', '.codeconductor']) {
    try {
      await rm(join(PROJECT_ROOT, dir), { recursive: true, force: true });
    } catch {}
  }
}

const ALL_AGENT_FILES = [
  'architect.md',
  'implementer.md',
  'tester.md',
  'orchestrator.md',
  'reviewer.md',
  'docs.md',
  'task-coach.md',
  'repo-explorer.md',
];

const EXPECTED_ROLES = [
  'architect',
  'implementer',
  'tester',
  'orchestrator',
  'reviewer',
  'docs',
  'task-coach',
  'repo-explorer',
];

// ========== 1. ModelConfigSchema Validation ==========

describe('ModelConfigSchema', () => {
  test('valid config passes validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'opencode',
      agents: {
        architect: { claude: 'claude-opus-4-7', opencode: 'deepseek-v4-pro', codex: 'gpt-5.5' },
      },
    });
    expect(result.success).toBe(true);
  });

  test('missing target field fails validation', () => {
    const result = ModelConfigSchema.safeParse({
      agents: { architect: { claude: 'a', opencode: 'b', codex: 'c' } },
    });
    expect(result.success).toBe(false);
  });

  test('invalid target value fails validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'invalid-target',
      agents: { architect: { claude: 'a', opencode: 'b', codex: 'c' } },
    });
    expect(result.success).toBe(false);
  });

  test('missing provider in agent model is valid (providers are optional)', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'opencode',
      agents: { architect: { claude: 'a', opencode: 'b' } },
    });
    expect(result.success).toBe(true);
  });

  test('empty agents object is valid', () => {
    const result = ModelConfigSchema.safeParse({ target: 'claude', agents: {} });
    expect(result.success).toBe(true);
  });

  test('multiple agent roles are validated correctly', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'codex',
      agents: {
        architect: { claude: 'a', opencode: 'b', codex: 'c' },
        tester: { claude: 'x', opencode: 'y', codex: 'z' },
      },
    });
    expect(result.success).toBe(true);
  });

  test('all five targets are valid enum values', () => {
    for (const target of ['opencode', 'claude', 'codex', 'gemini', 'cursor']) {
      const result = ModelConfigSchema.safeParse({
        target,
        agents: { role: { claude: 'a', opencode: 'b', codex: 'c' } },
      });
      expect(result.success).toBe(true);
    }
  });

  test('non-string model names fail validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'opencode',
      agents: { architect: { claude: 123, opencode: true, codex: null } },
    });
    expect(result.success).toBe(false);
  });

  test('config with tools and permissions mapping passes validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'opencode',
      agents: {
        architect: { claude: 'a', opencode: 'b', codex: 'c' },
      },
      tools: {
        Read: { claude: 'ViewCodeItem', opencode: 'file_read' },
      },
      permissions: {
        Read: 'read',
        Glob: 'glob',
      },
    });
    expect(result.success).toBe(true);
  });

  test('config with gemini and cursor providers passes validation', () => {
    const result = ModelConfigSchema.safeParse({
      target: 'gemini',
      agents: {
        architect: { claude: 'a', opencode: 'b', codex: 'c', gemini: 'd', cursor: 'e' },
      },
    });
    expect(result.success).toBe(true);
  });
});

// ========== 2. loadModelConfig() ==========

describe('loadModelConfig', () => {
  test('loads opencode model config with correct target', async () => {
    const config = await loadModelConfig('opencode');
    expect(config.target).toBe('opencode');
  });

  test('loads claude model config with correct target', async () => {
    const config = await loadModelConfig('claude');
    expect(config.target).toBe('claude');
  });

  test('loads codex model config with correct target', async () => {
    const config = await loadModelConfig('codex');
    expect(config.target).toBe('codex');
  });

  test('loads gemini model config with correct target', async () => {
    const config = await loadModelConfig('gemini');
    expect(config.target).toBe('gemini');
  });

  test('loads cursor model config with correct target', async () => {
    const config = await loadModelConfig('cursor');
    expect(config.target).toBe('cursor');
  });

  test('opencode config has architect models for all providers', async () => {
    const config = await loadModelConfig('opencode');
    expect(config.agents.architect.claude).toBe('claude-opus-4-7');
    expect(config.agents.architect.opencode).toBe('opencode-go/deepseek-v4-pro');
    expect(config.agents.architect.codex).toBe('gpt-5.5');
    expect(config.agents.architect.gemini).toBe('gemini-2.5-pro');
    expect(config.agents.architect.cursor).toBe('gpt-5.5');
  });

  test('claude config has implementer models for all providers', async () => {
    const config = await loadModelConfig('claude');
    expect(config.agents.implementer.claude).toBe('claude-sonnet-4-6');
    expect(config.agents.implementer.opencode).toBe('opencode-go/mimo-v2.5-pro');
    expect(config.agents.implementer.codex).toBe('gpt-5.3-codex');
    expect(config.agents.implementer.gemini).toBe('gemini-2.5-flash');
    expect(config.agents.implementer.cursor).toBe('gpt-5.3');
  });

  test('codex config has tester models for all providers', async () => {
    const config = await loadModelConfig('codex');
    expect(config.agents.tester.claude).toBe('claude-sonnet-4-6');
    expect(config.agents.tester.opencode).toBe('opencode-go/minimax-m2.7');
    expect(config.agents.tester.codex).toBe('gpt-5.3-codex');
    expect(config.agents.tester.gemini).toBe('gemini-2.5-flash');
    expect(config.agents.tester.cursor).toBe('gpt-5.3');
  });

  test('gemini config has all 8 agent roles', async () => {
    const config = await loadModelConfig('gemini');
    for (const role of EXPECTED_ROLES) {
      expect(config.agents[role]).toBeDefined();
      expect(typeof config.agents[role].gemini).toBe('string');
    }
  });

  test('cursor config has all 8 agent roles', async () => {
    const config = await loadModelConfig('cursor');
    for (const role of EXPECTED_ROLES) {
      expect(config.agents[role]).toBeDefined();
      expect(typeof config.agents[role].cursor).toBe('string');
    }
  });

  test('all 8 agent roles are present in each config file', async () => {
    for (const target of ['opencode', 'claude', 'codex', 'gemini', 'cursor'] as const) {
      const config = await loadModelConfig(target);
      for (const role of EXPECTED_ROLES) {
        expect(config.agents[role]).toBeDefined();
      }
    }
  });

  test('each config has exactly 8 agent roles', async () => {
    for (const target of ['opencode', 'claude', 'codex', 'gemini', 'cursor'] as const) {
      const config = await loadModelConfig(target);
      const roleKeys = Object.keys(config.agents);
      expect(roleKeys.length).toBe(8);
    }
  });

  test('non-opencode configs have tools mapping', async () => {
    for (const target of ['claude', 'codex', 'gemini', 'cursor'] as const) {
      const config = await loadModelConfig(target);
      expect(config.tools).toBeDefined();
      expect(config.tools?.Read).toBeDefined();
      expect(config.tools?.Write).toBeDefined();
      expect(config.tools?.Edit).toBeDefined();
      expect(config.tools?.Bash).toBeDefined();
      expect(config.tools?.Glob).toBeDefined();
      expect(config.tools?.Grep).toBeDefined();
    }
  });

  test('opencode config has permissions mapping and no deprecated tools mapping', async () => {
    const config = await loadModelConfig('opencode');
    expect(config.tools).toBeUndefined();
    expect(config.permissions).toEqual({
      Read: 'read',
      Write: 'edit',
      Edit: 'edit',
      Bash: 'bash',
      Glob: 'glob',
      Grep: 'grep',
      WebFetch: 'webfetch',
    });
  });
});

// ========== 3. copyFromManifest with modelConfig (unit-level) ==========

describe('copyFromManifest with modelConfig', () => {
  beforeAll(async () => {
    await cleanup();
  });

  test('dry-run with model config does not write files', async () => {
    const modelConfig = await loadModelConfig('opencode');
    const manifest = await loadManifest('opencode');
    const results = await copyFromManifest(
      manifest,
      PRESETS_DIR,
      join(PROJECT_ROOT, '.opencode'),
      false,
      true,
      true,
      modelConfig
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.dryRun === true)).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'))).toBe(false);
  });

  test('global opencode config merge preserves existing keys even with force', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'codeconductor-opencode-global-'));
    try {
      const existingPath = join(tempDir, '.opencode', 'opencode.jsonc');
      await mkdir(join(tempDir, '.opencode'), { recursive: true });
      await writeFile(
        existingPath,
        JSON.stringify({ custom: true, permission: { bash: { 'custom *': 'allow' } } }, null, 2),
        'utf-8'
      );

      const modelConfig = await loadModelConfig('opencode');
      const manifest = await loadManifest('opencode');
      const results = await copyFromManifest(
        manifest,
        PRESETS_DIR,
        tempDir,
        true,
        false,
        true,
        modelConfig
      );

      const configResult = results.find((r) => r.dest === existingPath);
      const content = JSON.parse(await readFile(existingPath, 'utf-8'));

      expect(configResult?.action).toBe('merged');
      expect(content.custom).toBe(true);
      expect(content.permission.bash['custom *']).toBe('allow');
      expect(content.model).toBe('opencode-go/qwen3.7-max');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('template entries are detected from opencode manifest', async () => {
    const manifest = await loadManifest('opencode');
    const templateEntries = manifest.entries.filter((e) => e.template === true);
    expect(templateEntries.length).toBe(1);
    expect(templateEntries[0].src).toContain('agents');
  });

  test('non-template entries exist in manifest', async () => {
    const manifest = await loadManifest('opencode');
    const nonTemplateEntries = manifest.entries.filter((e) => !e.template);
    expect(nonTemplateEntries.length).toBeGreaterThan(0);
    for (const entry of nonTemplateEntries) {
      expect(entry.template).toBeFalsy();
    }
  });

  test('writing with modelConfig replaces placeholders in agent files', async () => {
    const modelConfig = await loadModelConfig('opencode');
    const manifest = await loadManifest('opencode');
    const results = await copyFromManifest(
      manifest,
      PRESETS_DIR,
      PROJECT_ROOT,
      false,
      false,
      true,
      modelConfig
    );

    const architectContent = await readFile(
      join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'),
      'utf-8'
    );
    // opencode install: only the opencode model appears in frontmatter
    expect(architectContent).toContain('deepseek-v4-pro');
    expect(architectContent).not.toContain('{{MODEL}}');
    expect(architectContent).not.toContain('{{MODEL_CLAUDE}}');
    expect(architectContent).not.toContain('{{MODEL_OPENCODE}}');
    expect(architectContent).not.toContain('{{MODEL_CODEX}}');
  });

  test('writing without modelConfig leaves placeholders intact', async () => {
    const manifest = await loadManifest('opencode');
    const results = await copyFromManifest(
      manifest,
      PRESETS_DIR,
      PROJECT_ROOT,
      false,
      false,
      true,
      null
    );

    const architectContent = await readFile(
      join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(architectContent).toContain('{{MODEL}}');
  });

  test('writing with modelConfig renders all 8 agent files correctly', async () => {
    const modelConfig = await loadModelConfig('opencode');
    const manifest = await loadManifest('opencode');
    await copyFromManifest(manifest, PRESETS_DIR, PROJECT_ROOT, false, false, true, modelConfig);

    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', file), 'utf-8');
      expect(content).not.toContain('{{MODEL}}');
      expect(content).not.toContain('{{MODEL_');
      // opencode install: frontmatter has model: field resolved to opencode model
      expect(content).toMatch(/^model: /m);
    }
  });
});

// ========== 4. Agent File Template Placeholders (source files) ==========

describe('Agent file templates (source presets)', () => {
  test('all opencode agent files contain {{MODEL}} placeholder in frontmatter', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8');
      expect(content).toContain('{{MODEL}}');
      expect(content).not.toContain('{{MODEL_CLAUDE}}');
      expect(content).not.toContain('{{MODEL_OPENCODE}}');
      expect(content).not.toContain('{{MODEL_CODEX}}');
    }
  });

  test('each opencode agent file has exactly 1 {{MODEL}} placeholder', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8');
      const modelMatches = (content.match(/\{\{MODEL\}\}/g) || []).length;
      expect(modelMatches).toBe(1);
    }
  });

  test('opencode shared agent source files keep base tools for cross-target rendering', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8');
      expect(content).toContain('tools:');
      expect(content).toContain('permission:');
      expect(content).not.toContain('maxTurns:');
    }
  });

  test('codex AGENTS.md contains exactly 8 occurrences of {{MODEL_CODEX}} and none of the others', async () => {
    const content = await readFile(join(PRESETS_DIR, 'codex', 'AGENTS.md'), 'utf-8');
    const claudeCount = (content.match(/\{\{MODEL_CLAUDE\}\}/g) || []).length;
    const opencodeCount = (content.match(/\{\{MODEL_OPENCODE\}\}/g) || []).length;
    const codexCount = (content.match(/\{\{MODEL_CODEX\}\}/g) || []).length;
    expect(claudeCount).toBe(0);
    expect(opencodeCount).toBe(0);
    expect(codexCount).toBe(8);
  });

  test('opencode agent files still have valid frontmatter', async () => {
    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PRESETS_DIR, 'opencode', 'agents', file), 'utf-8');
      expect(content.startsWith('---')).toBe(true);
      const secondDash = content.indexOf('---', 3);
      expect(secondDash).toBeGreaterThan(0);
    }
  });
});

// ========== 5. Manifest Template Flag ==========

describe('Manifest template flag', () => {
  test('opencode manifest marks agents entry as template', async () => {
    const manifest = await loadManifest('opencode');
    const agentsEntry = manifest.entries.find((e) => e.src.includes('agents'));
    expect(agentsEntry).toBeDefined();
    expect(agentsEntry!.template).toBe(true);
  });

  test('claude manifest marks agents entry as template', async () => {
    const manifest = await loadManifest('claude');
    const agentsEntry = manifest.entries.find((e) => e.src.includes('agents'));
    expect(agentsEntry).toBeDefined();
    expect(agentsEntry!.template).toBe(true);
  });

  test('codex manifest marks AGENTS.md entry as template', async () => {
    const manifest = await loadManifest('codex');
    const agentsEntry = manifest.entries.find((e) => e.src.includes('AGENTS.md'));
    expect(agentsEntry).toBeDefined();
    expect(agentsEntry!.template).toBe(true);
  });

  test('non-agent entries do not have template flag set', async () => {
    const manifest = await loadManifest('opencode');
    const nonAgentEntries = manifest.entries.filter((e) => !e.src.includes('agents'));
    for (const entry of nonAgentEntries) {
      expect(entry.template).toBeUndefined();
    }
  });

  test('claude manifest has exactly 6 entries', async () => {
    const manifest = await loadManifest('claude');
    expect(manifest.entries.length).toBe(6);
  });

  test('codex manifest has exactly 3 entries', async () => {
    const manifest = await loadManifest('codex');
    expect(manifest.entries.length).toBe(3);
  });
});

// ========== 6. End-to-End CLI Tests ==========

describe('End-to-end: CLI install preset renders model names', () => {
  beforeAll(async () => {
    await cleanup();
  });
  beforeEach(async () => {
    await cleanup();
  });

  test('opencode: install preset creates agent files (files exist)', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'preset', '--target=opencode', '--force']);
    expect(result.exitCode).toBe(0);

    for (const file of ALL_AGENT_FILES) {
      expect(existsSync(join(PROJECT_ROOT, '.opencode', 'agents', file))).toBe(true);
    }
  });

  test('claude: install preset creates agent files (files exist)', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'preset', '--target=claude', '--force']);
    expect(result.exitCode).toBe(0);

    for (const file of ALL_AGENT_FILES) {
      expect(existsSync(join(PROJECT_ROOT, '.claude', 'agents', file))).toBe(true);
    }
  });

  test('codex: install preset creates AGENTS.md', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'preset', '--target=codex', '--force']);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'AGENTS.md'))).toBe(true);
  });

  // --- TEMPLATE RENDERING (Acceptance Criteria) ---
  // These test that the CLI renders model names in generated files.

  test('opencode: architect.md should have rendered model names (no placeholders)', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=opencode', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'),
      'utf-8'
    );
    // opencode install: frontmatter has the opencode model for architect
    expect(content).toContain('deepseek-v4-pro');
    // Should NOT contain placeholders
    expect(content).not.toContain('{{MODEL}}');
    expect(content).not.toContain('{{MODEL_CLAUDE}}');
    expect(content).not.toContain('{{MODEL_OPENCODE}}');
    expect(content).not.toContain('{{MODEL_CODEX}}');
  });

  test('opencode: all 8 agent files should have no placeholders', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=opencode', '--force']);

    for (const file of ALL_AGENT_FILES) {
      const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', file), 'utf-8');
      expect(content).not.toContain('{{MODEL}}');
      expect(content).not.toContain('{{MODEL_');
    }
  });

  test('opencode: tester.md should have correct model name in frontmatter', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=opencode', '--force']);

    const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'tester.md'), 'utf-8');
    // opencode install: frontmatter has opencode model for tester
    expect(content).toContain('minimax-m2.7');
    expect(content).not.toContain('{{MODEL}}');
  });

  test('codex AGENTS.md should have rendered codex model names only', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=codex', '--force']);

    const content = await readFile(join(PROJECT_ROOT, '.codex', 'AGENTS.md'), 'utf-8');
    // codex install: only codex model names appear (e.g. gpt-5.5 for architect)
    expect(content).toContain('gpt-5.5');
    expect(content).not.toContain('{{MODEL_CODEX}}');
    expect(content).not.toContain('{{MODEL_CLAUDE}}');
    expect(content).not.toContain('{{MODEL_OPENCODE}}');
    // claude and opencode models should NOT appear in codex AGENTS.md
    expect(content).not.toContain('claude-opus-4-7');
    expect(content).not.toContain('deepseek-v4-pro');
  });

  test('claude: architect.md should have claude model in frontmatter', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=claude', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.claude', 'agents', 'architect.md'),
      'utf-8'
    );
    // claude install: frontmatter has claude model for architect
    expect(content).toContain('claude-opus-4-7');
    expect(content).not.toContain('{{MODEL}}');
    expect(content).not.toContain('{{MODEL_CLAUDE}}');
  });

  test('gemini: install preset creates agent files (files exist)', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'preset', '--target=gemini', '--force']);
    expect(result.exitCode).toBe(0);

    for (const file of ALL_AGENT_FILES) {
      expect(existsSync(join(PROJECT_ROOT, '.gemini', 'agents', file))).toBe(true);
    }
  });

  test('cursor: install preset creates agent files (files exist)', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'preset', '--target=cursor', '--force']);
    expect(result.exitCode).toBe(0);

    for (const file of ALL_AGENT_FILES) {
      expect(existsSync(join(PROJECT_ROOT, '.cursor', 'agents', file))).toBe(true);
    }
  });

  test('gemini: architect.md should have gemini model in frontmatter', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=gemini', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.gemini', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(content).toContain('gemini-2.5-pro');
    expect(content).not.toContain('{{MODEL}}');
  });

  test('cursor: architect.md should have cursor model in frontmatter', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=cursor', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.cursor', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(content).toContain('gpt-5.5');
    expect(content).not.toContain('{{MODEL}}');
  });

  test('target=all should render for all five presets', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=all', '--force']);

    const opencodeContent = await readFile(
      join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(opencodeContent).not.toContain('{{MODEL}}');
    expect(opencodeContent).not.toContain('{{MODEL_');
    expect(opencodeContent).toContain('deepseek-v4-pro');

    const claudeContent = await readFile(
      join(PROJECT_ROOT, '.claude', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(claudeContent).not.toContain('{{MODEL}}');
    expect(claudeContent).not.toContain('{{MODEL_');
    expect(claudeContent).toContain('claude-opus-4-7');

    const codexContent = await readFile(join(PROJECT_ROOT, '.codex', 'AGENTS.md'), 'utf-8');
    expect(codexContent).not.toContain('{{MODEL_');
    expect(codexContent).toContain('gpt-5.5');

    const geminiContent = await readFile(
      join(PROJECT_ROOT, '.gemini', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(geminiContent).not.toContain('{{MODEL}}');
    expect(geminiContent).not.toContain('{{MODEL_');
    expect(geminiContent).toContain('gemini-2.5-pro');

    const cursorContent = await readFile(
      join(PROJECT_ROOT, '.cursor', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(cursorContent).not.toContain('{{MODEL}}');
    expect(cursorContent).not.toContain('{{MODEL_');
    expect(cursorContent).toContain('gpt-5.5');
  });

  test('orchestrator agent should have correct opencode model in frontmatter', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=opencode', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.opencode', 'agents', 'orchestrator.md'),
      'utf-8'
    );
    // opencode install: frontmatter has opencode model for orchestrator
    expect(content).toContain('deepseek-v4-pro');
    expect(content).not.toContain('{{MODEL}}');
  });

  test('docs agent should have correct opencode model in frontmatter', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=opencode', '--force']);

    const content = await readFile(join(PROJECT_ROOT, '.opencode', 'agents', 'docs.md'), 'utf-8');
    // opencode install: frontmatter has opencode model for docs
    expect(content).toContain('qwen3.6-plus');
    expect(content).not.toContain('{{MODEL}}');
  });
});

// ========== 7. Tool Name Substitution Tests ==========

describe('Tool name substitution', () => {
  beforeAll(async () => {
    await cleanup();
  });
  beforeEach(async () => {
    await cleanup();
  });

  test('opencode: architect.md should use permissions and omit deprecated tools', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=opencode', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(content).not.toContain('tools:');
    expect(content).not.toContain('file_read / view_file');
    expect(content).not.toContain('dir_list / glob');
    expect(content).not.toContain('grep_search / search');
    expect(content).not.toContain('maxTurns:');
    expect(content).toContain('permission:');
    expect(content).toContain('  read: allow');
    expect(content).toContain('  glob: allow');
    expect(content).toContain('  grep: allow');
  });

  test('claude: architect.md should have claude tool names', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=claude', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.claude', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(content).toContain('tools: ViewCodeItem / ReadFile, Glob, Grep');
  });

  test('codex: AGENTS.md does not have tools line (monolithic format)', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=codex', '--force']);

    const content = await readFile(join(PROJECT_ROOT, '.codex', 'AGENTS.md'), 'utf-8');
    // codex AGENTS.md is monolithic and does not have a "tools:" frontmatter line
    expect(content).not.toContain('tools:');
  });

  test('gemini: architect.md should have gemini tool names', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=gemini', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.gemini', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(content).toContain('tools: view_file, list_dir, search_grep');
  });

  test('cursor: architect.md should have cursor tool names', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=cursor', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.cursor', 'agents', 'architect.md'),
      'utf-8'
    );
    expect(content).toContain('tools: read, find, grep');
  });

  test('opencode: implementer.md should use permissions and omit deprecated tools', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=opencode', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.opencode', 'agents', 'implementer.md'),
      'utf-8'
    );
    expect(content).not.toContain('tools:');
    expect(content).not.toContain('file_read / view_file');
    expect(content).not.toContain('file_write');
    expect(content).not.toContain('file_patch / edit');
    expect(content).not.toContain('bash / run_command');
    expect(content).not.toContain('dir_list / glob');
    expect(content).not.toContain('grep_search / search');
    expect(content).toContain('permission:');
    expect(content).toContain('  read: allow');
    expect(content).toContain('  edit: allow');
    expect(content).toContain('  bash:');
    expect(content).toContain('  glob: allow');
    expect(content).toContain('  grep: allow');
  });

  test('gemini: implementer.md should have all 6 tool names', async () => {
    await runCli(['init', '--force']);
    await runCli(['install', 'preset', '--target=gemini', '--force']);

    const content = await readFile(
      join(PROJECT_ROOT, '.gemini', 'agents', 'implementer.md'),
      'utf-8'
    );
    expect(content).toContain(
      'tools: view_file, write_file, patch_file, execute_command, list_dir, search_grep'
    );
  });
});
