import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { helpCommand } from '../src/commands/help.command';

const projectRoot = import.meta.dir + '/..';
const HELP_TMP = join(import.meta.dir, 'fixtures', 'help-tmp');

const CONFIG_TARGET_OPENCODE = `version: 0.2.0
project:
  name: help-test
defaults:
  target: opencode
  overwrite: false
  locale: en
presets:
  council:
    enabled: true
    version: 0.1.0
safety:
  destructiveCommands: []
  secretPatterns: []
`;

const CONFIG_TARGET_AGY = `version: 0.2.0
project:
  name: help-test
defaults:
  target: agy
  overwrite: false
  locale: en
presets:
  council:
    enabled: true
    version: 0.1.0
safety:
  destructiveCommands: []
  secretPatterns: []
`;

describe('helpCommand', () => {
  test('returns inventory for opencode target (default)', async () => {
    const result = await helpCommand({
      projectRoot,
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('opencode');
  });

  test('returns inventory for claude target', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'claude',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('claude');
  });

  test('returns inventory for codex target', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'codex',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('codex');
  });

  test('returns inventory for agy target', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'agy',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('agy');
  });

  test('human output includes skills, subagents, and commands sections', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'opencode',
      output: 'human',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; message: string };
    expect(data.success).toBe(true);
    expect(data.message).toContain('Skills');
    expect(data.message).toContain('Subagents');
    expect(data.message).toContain('Commands');
  });

  test('handles non-existent target gracefully', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'nonexistent',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.skills).toHaveLength(0);
    expect(data.inventory.agents).toHaveLength(0);
    expect(data.inventory.commands).toHaveLength(0);
  });
});

describe('helpCommand — preset content verification', () => {
  test('opencode inventory includes real subagents (architect, tester, etc.)', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'opencode',
      output: 'json',
    });

    const data = result.data as { inventory: { agents: string[]; skills: string[]; commands: string[] } };
    expect(data.inventory.agents.length).toBeGreaterThan(0);
    // Spot-check that a known agent is listed
    expect(data.inventory.agents).toContain('architect');
  });

  test('opencode inventory includes real commands (cc-feature, cc-fix, etc.)', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'opencode',
      output: 'json',
    });

    const data = result.data as { inventory: { commands: string[] } };
    expect(data.inventory.commands.length).toBeGreaterThan(0);
    expect(data.inventory.commands).toContain('cc-feature');
  });

  test('opencode inventory includes real skills', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'opencode',
      output: 'json',
    });

    const data = result.data as { inventory: { skills: string[] } };
    expect(data.inventory.skills.length).toBeGreaterThan(0);
  });

  test('agy inventory includes workflows', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'agy',
      output: 'json',
    });

    const data = result.data as { inventory: { workflows: string[] } };
    expect(data.inventory.workflows.length).toBeGreaterThan(0);
  });

  test('codex inventory lists skills directory contents', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'codex',
      output: 'json',
    });

    const data = result.data as { inventory: { skills: string[] } };
    expect(data.inventory.skills.length).toBeGreaterThan(0);
  });

  test('claude inventory lists skills directory contents', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'claude',
      output: 'json',
    });

    const data = result.data as { inventory: { skills: string[] } };
    expect(data.inventory.skills.length).toBeGreaterThan(0);
  });
});

describe('helpCommand — active preset from config', () => {
  beforeEach(async () => {
    await mkdir(join(HELP_TMP, '.codeconductor'), { recursive: true });
  });

  afterEach(async () => {
    await rm(HELP_TMP, { recursive: true, force: true });
  });

  test('reads active preset from .codeconductor/config.yml (default = opencode)', async () => {
    // The help-tmp project has its own presets/ dir for the configured target
    await writeFile(join(HELP_TMP, '.codeconductor', 'config.yml'), CONFIG_TARGET_OPENCODE);
    // Create a presets/opencode/ with at least one skill so the inventory is non-empty
    await mkdir(join(HELP_TMP, 'presets', 'opencode', 'skills'), { recursive: true });
    await writeFile(join(HELP_TMP, 'presets', 'opencode', 'skills', 'dummy.md'), '# dummy');

    const result = await helpCommand({
      projectRoot: HELP_TMP,
      output: 'json',
    });

    const data = result.data as {
      success: boolean;
      defaultTarget: string;
      inventory: { target: string; skills: string[] };
    };
    expect(data.success).toBe(true);
    expect(data.defaultTarget).toBe('opencode');
    expect(data.inventory.target).toBe('opencode');
    expect(data.inventory.skills).toContain('dummy');
  });

  test('reads active preset = agy from config when defaults.target is agy', async () => {
    await writeFile(join(HELP_TMP, '.codeconductor', 'config.yml'), CONFIG_TARGET_AGY);
    await mkdir(join(HELP_TMP, 'presets', 'agy', 'skills'), { recursive: true });
    await writeFile(join(HELP_TMP, 'presets', 'agy', 'skills', 'agy-skill.md'), '# agy');

    const result = await helpCommand({
      projectRoot: HELP_TMP,
      output: 'json',
    });

    const data = result.data as {
      success: boolean;
      defaultTarget: string;
      inventory: { target: string; skills: string[] };
    };
    expect(data.defaultTarget).toBe('agy');
    expect(data.inventory.target).toBe('agy');
    expect(data.inventory.skills).toContain('agy-skill');
  });

  test('explicit target override beats config default', async () => {
    // Config says opencode, but we explicitly ask for codex
    await writeFile(join(HELP_TMP, '.codeconductor', 'config.yml'), CONFIG_TARGET_OPENCODE);
    await mkdir(join(HELP_TMP, 'presets', 'codex', 'skills'), { recursive: true });
    await writeFile(join(HELP_TMP, 'presets', 'codex', 'skills', 'codex-skill.md'), '# codex');

    const result = await helpCommand({
      projectRoot: HELP_TMP,
      target: 'codex',
      output: 'json',
    });

    const data = result.data as {
      defaultTarget: string;
      inventory: { target: string; skills: string[] };
    };
    // defaultTarget stays as configured
    expect(data.defaultTarget).toBe('opencode');
    // inventory uses the override
    expect(data.inventory.target).toBe('codex');
    expect(data.inventory.skills).toContain('codex-skill');
  });
});

describe('helpCommand — human output inventory content', () => {
  test('human output lists each skill as a bullet point', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'opencode',
      output: 'human',
    });

    const data = result.data as { message: string };
    expect(data.message).toMatch(/Skills \(\d+\):/);
    expect(data.message).toMatch(/  - /);
  });

  test('human output marks the active target with "(active)"', async () => {
    // Default is opencode. When we don't override, the human message should
    // annotate opencode as active.
    const result = await helpCommand({
      projectRoot,
      target: 'opencode',
      output: 'human',
    });

    const data = result.data as { message: string };
    expect(data.message).toContain('opencode (active)');
  });

  test('human output does NOT mark non-default target as active', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'claude',
      output: 'human',
    });

    const data = result.data as { message: string };
    // The header line should say claude without (active)
    expect(data.message).toMatch(/CodeConductor Help — claude\b/);
    expect(data.message).not.toContain('claude (active)');
  });
});
