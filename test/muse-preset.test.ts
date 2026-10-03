import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { loadManifest, loadModelConfig, loadTargetCapabilities } from '../src/core/presets/manifest-loader';
import { surfaceForRunner } from '../src/core/presets/command-invocation';
import { invokeCli } from './helpers/invoke-cli';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
let TEST_DIR: string;

beforeAll(async () => {
  TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-muse-preset-'));
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('Muse preset — file existence', () => {
  const expectedPaths = [
    'presets/muse/AGENTS.md',
    'presets/muse/hooks.json',
    'src/presets/manifests/muse.yml',
    'src/presets/models/muse.yml',
    'src/presets/targets/muse.yml',
  ];

  for (const p of expectedPaths) {
    test(`${p} exists`, () => {
      expect(existsSync(join(PROJECT_ROOT, p))).toBe(true);
    });
  }
});

describe('Muse manifest', () => {
  test('loads and validates against InstallManifestSchema', async () => {
    const manifest = await loadManifest('muse');
    expect(manifest.target).toBe('muse');
    expect(manifest.entries.length).toBeGreaterThan(0);
  });

  test('reuses shared skills into .agents/skills (native Muse discovery)', async () => {
    const manifest = await loadManifest('muse');
    const skillsEntry = manifest.entries.find((e) => e.dest === '.agents/skills');
    expect(skillsEntry).toBeDefined();
    expect(skillsEntry?.src).toBe('opencode/skills');
  });

  test('installs hooks into .muse/hooks.json (native Muse hooks path)', async () => {
    const manifest = await loadManifest('muse');
    const hooksEntry = manifest.entries.find((e) => e.dest === '.muse/hooks.json');
    expect(hooksEntry).toBeDefined();
    expect(hooksEntry?.src).toBe('muse/hooks.json');
  });

  test('AGENTS.md installs at project root with merge-managed strategy', async () => {
    const manifest = await loadManifest('muse');
    const agentsEntry = manifest.entries.find((e) => e.src === 'muse/AGENTS.md');
    expect(agentsEntry?.dest).toBe('AGENTS.md');
    expect(agentsEntry?.strategy).toBe('merge-managed');
  });

  test('global install carries skills only (AGENTS.md and hooks are skipped)', async () => {
    const manifest = await loadManifest('muse');
    const agentsEntry = manifest.entries.find((e) => e.src === 'muse/AGENTS.md');
    const hooksEntry = manifest.entries.find((e) => e.dest === '.muse/hooks.json');
    const skillsEntry = manifest.entries.find((e) => e.dest === '.agents/skills');
    expect(agentsEntry?.globalStrategy).toBe('skip');
    expect(hooksEntry?.globalStrategy).toBe('skip');
    expect(skillsEntry?.globalStrategy).not.toBe('skip');
  });
});

describe('Muse model config', () => {
  test('loadModelConfig("muse") resolves target and all 14 agent roles', async () => {
    const config = await loadModelConfig('muse');
    expect(config.target).toBe('muse');
    expect(Object.keys(config.agents)).toHaveLength(14);
  });

  test('every role defaults to muse-spark-1.3', async () => {
    const config = await loadModelConfig('muse');
    for (const role of Object.keys(config.agents)) {
      expect(config.agents[role].muse).toBe('muse-spark-1.3');
    }
  });

  test('muse carries no tools override (canonical tool names are kept)', async () => {
    const config = await loadModelConfig('muse');
    expect(config.permissions).toBeUndefined();
  });
});

describe('Muse target capabilities', () => {
  test('loadTargetCapabilities("muse") validates and matches researched docs', async () => {
    const caps = await loadTargetCapabilities('muse');
    expect(caps.target).toBe('muse');
    expect(caps.invocation).toBe('colon');
    expect(caps.commandFormat).toBe('skill');
    expect(caps.contextFile).toBe('AGENTS.md');
    expect(caps.subagentInvocationStyle).toBe('invoke-with-context');
  });

  test('capabilities reflect documented design (subagents, hooks, mcp; council in phase 2)', async () => {
    const caps = await loadTargetCapabilities('muse');
    expect(caps.capabilities.subagents).toBe(true);
    expect(caps.capabilities.mcp).toBe(true);
    expect(caps.capabilities.hooks).toBe(true);
    expect(caps.capabilities.council).toBe(false);
  });

  test('invocation matches surfaceForRunner("muse")', async () => {
    const caps = await loadTargetCapabilities('muse');
    expect(caps.invocation).toBe(surfaceForRunner('muse'));
  });
});

describe('Muse AGENTS.md (review W2/W3)', () => {
  const agentsMd = () =>
    readFileSync(join(PROJECT_ROOT, 'presets/muse/AGENTS.md'), 'utf-8');

  test('command spelling matches the colon invocation in capabilities', async () => {
    const caps = await loadTargetCapabilities('muse');
    expect(caps.invocation).toBe('colon');
    expect(agentsMd()).toContain('/cc:<name>');
    expect(agentsMd()).not.toContain('/cc-<name>');
  });

  test('references only paths the manifest installs', async () => {
    const manifest = await loadManifest('muse');
    const dests = manifest.entries.map((e) => e.dest);
    expect(dests).not.toContain('.agents/agents');
    expect(agentsMd()).not.toContain('.agents/agents/');
    expect(agentsMd()).not.toContain('.agents/prompts/');
  });
});

describe('Muse preset install (CLI contract)', () => {
  test('install preset --target muse writes skills, hooks and AGENTS.md', async () => {
    const result = await invokeCli(['install', 'preset', '--target', 'muse', '--force'], TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, '.agents', 'skills'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.muse', 'hooks.json'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'AGENTS.md'))).toBe(true);
  });

  test('install preset --target muse --dry-run writes nothing', async () => {
    const dryDir = await mkdtemp(join(tmpdir(), 'cc-muse-dry-'));
    try {
      const result = await invokeCli(
        ['install', 'preset', '--target', 'muse', '--dry-run'],
        dryDir,
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dryDir, '.agents'))).toBe(false);
      expect(existsSync(join(dryDir, '.muse'))).toBe(false);
      expect(existsSync(join(dryDir, 'AGENTS.md'))).toBe(false);
    } finally {
      await rm(dryDir, { recursive: true, force: true });
    }
  });

  test('doctor passes with the muse target installed', async () => {
    await invokeCli(['install', 'preset', '--target', 'muse', '--force'], TEST_DIR);
    const codeconductorDir = join(TEST_DIR, '.codeconductor');
    await mkdir(join(codeconductorDir, 'presets'), { recursive: true });
    await writeFile(
      join(codeconductorDir, 'config.yml'),
      [
        'version: 0.3.0',
        'project:',
        '  name: muse-fixture',
        'defaults:',
        '  target: muse',
        '  overwrite: false',
        '  locale: en',
        'presets:',
        '  council:',
        '    enabled: false',
        '    version: 0.3.0',
        'safety:',
        '  destructiveCommands: []',
        '  secretPatterns: []',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = await invokeCli(['doctor'], TEST_DIR);
    expect(result.exitCode).toBe(0);
  });
});
