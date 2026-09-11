import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { loadManifest, loadModelConfig, loadTargetCapabilities } from '../src/core/presets/manifest-loader';
import { surfaceForRunner } from '../src/core/presets/command-invocation';
import { generatePiFiles } from '../src/adapters/pi/pi-council-generator';
import { CouncilSpecSchema } from '../src/validation/schemas';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';

const PROJECT_ROOT = resolve(import.meta.dir, '..');

describe('Pi preset — file existence', () => {
  const expectedPaths = [
    'presets/pi/AGENTS.md',
    'presets/pi/settings.json',
    'src/presets/manifests/pi.yml',
    'src/presets/models/pi.yml',
    'src/presets/targets/pi.yml',
  ];

  for (const p of expectedPaths) {
    test(`${p} exists`, () => {
      expect(existsSync(join(PROJECT_ROOT, p))).toBe(true);
    });
  }
});

describe('Pi manifest', () => {
  test('loads and validates against InstallManifestSchema', async () => {
    const manifest = await loadManifest('pi');
    expect(manifest.target).toBe('pi');
    expect(manifest.entries.length).toBeGreaterThan(0);
  });

  test('routes skills, agent references, and v1.0.0 prompts through .agents/ — shared with agy', async () => {
    const manifest = await loadManifest('pi');
    const dests = manifest.entries.map((e) => e.dest);
    expect(dests).toContain('.agents/skills');
    expect(dests).toContain('.agents/agents');
    expect(dests).toContain('.agents/prompts/v1.0.0');
  });

  test('routes commands to .pi/prompts (flat, filename = command, per pi.dev docs)', async () => {
    const manifest = await loadManifest('pi');
    const commandsEntry = manifest.entries.find((e) => e.dest === '.pi/prompts');
    expect(commandsEntry).toBeDefined();
    expect(commandsEntry?.src).toBe('opencode/commands');
  });

  test('AGENTS.md installs at project root, not nested — pi.dev docs confirm root-level discovery', async () => {
    const manifest = await loadManifest('pi');
    const agentsEntry = manifest.entries.find((e) => e.src === 'pi/AGENTS.md');
    expect(agentsEntry?.dest).toBe('AGENTS.md');
    expect(agentsEntry?.strategy).toBe('merge-managed');
  });
});

describe('Pi model config', () => {
  test('loadModelConfig("pi") resolves target and all 14 agent roles', async () => {
    const config = await loadModelConfig('pi');
    expect(config.target).toBe('pi');
    expect(Object.keys(config.agents)).toHaveLength(14);
  });

  test('every role has a pi model value', async () => {
    const config = await loadModelConfig('pi');
    for (const role of Object.keys(config.agents)) {
      expect(typeof config.agents[role].pi).toBe('string');
      expect(config.agents[role].pi!.length).toBeGreaterThan(0);
    }
  });

  test('pi carries no tools override (nothing in its generated content substitutes tool names)', async () => {
    const config = await loadModelConfig('pi');
    expect(config.permissions).toBeUndefined();
  });
});

describe('Pi target capabilities', () => {
  test('loadTargetCapabilities("pi") validates and matches researched pi.dev docs', async () => {
    const caps = await loadTargetCapabilities('pi');
    expect(caps.target).toBe('pi');
    expect(caps.invocation).toBe('hyphen');
    expect(caps.commandFormat).toBe('markdown');
    expect(caps.contextFile).toBe('AGENTS.md');
    expect(caps.subagentInvocationStyle).toBe('invoke-with-context');
  });

  test('capabilities reflect pi.dev\'s own documented design choices (no MCP, no subagents)', async () => {
    const caps = await loadTargetCapabilities('pi');
    expect(caps.capabilities.subagents).toBe(false);
    expect(caps.capabilities.mcp).toBe(false);
    expect(caps.capabilities.hooks).toBe(false);
    expect(caps.capabilities.council).toBe(true);
  });

  test('invocation matches surfaceForRunner("pi")', async () => {
    const caps = await loadTargetCapabilities('pi');
    expect(caps.invocation).toBe(surfaceForRunner('pi'));
  });
});

describe('Pi council generator', () => {
  const SPEC = CouncilSpecSchema.parse(
    parse(readFileSync(join(PROJECT_ROOT, 'src/presets/council/council.yml'), 'utf-8'))
  );

  test('generates a council skill under .agents/skills/ (shared with agy)', () => {
    const files = generatePiFiles(SPEC);
    const skill = files.find((f) => f.path === '.agents/skills/council/SKILL.md');
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('name: council');
  });

  test('generates one reference file per council agent under .agents/agents/', () => {
    const files = generatePiFiles(SPEC);
    const agentFiles = files.filter((f) => f.path.startsWith('.agents/agents/council-'));
    expect(agentFiles).toHaveLength(SPEC.agents.length);
  });

  test('generates the workflow command at .pi/prompts/cc-council.md using $ARGUMENTS directly', () => {
    const files = generatePiFiles(SPEC);
    const workflow = files.find((f) => f.path === '.pi/prompts/cc-council.md');
    expect(workflow).toBeDefined();
    expect(workflow!.content).toContain('$ARGUMENTS');
    expect(workflow!.content).not.toContain('{{args}}');
  });

  test('the workflow never mentions a Task tool — pi has none', () => {
    const files = generatePiFiles(SPEC);
    const workflow = files.find((f) => f.path === '.pi/prompts/cc-council.md');
    expect(workflow!.content).not.toContain('Task tool');
  });
});
