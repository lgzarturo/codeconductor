import { describe, expect, test, afterEach, beforeEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  getTargetInstallationPath,
  isTargetInstalled,
  validateAgentFileSizes,
  checkUpdates,
  loadSkillsLock,
  validateAgentMarkers
} from '../src/core/presets/update-checker';

const TEST_DIR = resolve(import.meta.dir, '..', 'test-update-checker-tmp');

describe('Update Checker & Smart Updates', () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('getTargetInstallationPath', () => {
    const localAgy = getTargetInstallationPath('agy', '/test/base', false);
    expect(localAgy).toBe(resolve('/test/base', '.agents'));

    const globalAgy = getTargetInstallationPath('agy', '/test/base', true);
    expect(globalAgy).toBe(resolve('/test/base', '.gemini', 'config'));

    const localClaude = getTargetInstallationPath('claude', '/test/base', false);
    expect(localClaude).toBe(resolve('/test/base', '.claude'));

    const globalClaude = getTargetInstallationPath('claude', '/test/base', true);
    expect(globalClaude).toBe(resolve('/test/base', '.claude'));
  });

  test('isTargetInstalled', async () => {
    // Before creating anything
    const installedBefore = await isTargetInstalled('opencode', TEST_DIR, false);
    expect(installedBefore).toBe(false);

    // Create target folder
    const targetDir = join(TEST_DIR, '.opencode');
    await mkdir(targetDir, { recursive: true });

    const installedAfter = await isTargetInstalled('opencode', TEST_DIR, false);
    expect(installedAfter).toBe(true);
  });

  test('validateAgentFileSizes warns on > 40KB files', async () => {
    const claudeDir = join(TEST_DIR, '.claude');
    await mkdir(claudeDir, { recursive: true });

    const claudeFile = join(claudeDir, 'CLAUDE.md');
    
    // Write small content
    await writeFile(claudeFile, 'small content', 'utf-8');
    let largeFiles = await validateAgentFileSizes(TEST_DIR, false);
    expect(largeFiles.length).toBe(0);

    // Write >40KB content
    const largeContent = 'a'.repeat(40 * 1024 + 100);
    await writeFile(claudeFile, largeContent, 'utf-8');
    largeFiles = await validateAgentFileSizes(TEST_DIR, false);
    expect(largeFiles.length).toBe(1);
    expect(largeFiles[0].path).toBe(claudeFile);
    expect(largeFiles[0].size).toBeGreaterThan(40 * 1024);
  });

  test('loadSkillsLock', async () => {
    const codeconductorDir = join(TEST_DIR, '.codeconductor');
    await mkdir(codeconductorDir, { recursive: true });
    
    const lockFile = join(codeconductorDir, 'skills-lock.json');
    const mockLock = { 'android': '1.0.0' };
    await writeFile(lockFile, JSON.stringify(mockLock), 'utf-8');

    const loaded = await loadSkillsLock(TEST_DIR);
    expect(loaded).toEqual(mockLock);
  });

  test('checkUpdates detects modifications in presets', async () => {
    const codeconductorDir = join(TEST_DIR, '.codeconductor');
    await mkdir(join(codeconductorDir, 'presets'), { recursive: true });

    // Write different/mock content to local council.yml and policy.yml
    await writeFile(join(codeconductorDir, 'presets', 'council.yml'), 'version: 0.0.0-mock');
    await writeFile(join(codeconductorDir, 'presets', 'policy.yml'), 'safety: none');

    const result = await checkUpdates(TEST_DIR, false);
    expect(result.council).toBe(true);
    expect(result.policy).toBe(true);
    expect(result.hasUpdates).toBe(true);
  });

  test('validateAgentMarkers warns on missing or invalid markers', async () => {
    // Create target directories for claude
    const claudeDir = join(TEST_DIR, '.claude');
    await mkdir(claudeDir, { recursive: true });

    const claudeFile = join(claudeDir, 'CLAUDE.md');

    // Missing markers entirely
    await writeFile(claudeFile, 'no markers at all', 'utf-8');
    let results = await validateAgentMarkers(TEST_DIR, false);
    
    const fileResult = results.find(r => r.path.endsWith('CLAUDE.md'));
    expect(fileResult).toBeDefined();
    expect(fileResult?.error).toBe('Missing managed markers');

    // Invalid markers (begin but no end)
    await writeFile(claudeFile, '<!-- CODECONDUCTOR:BEGIN managed -->\nno end marker', 'utf-8');
    results = await validateAgentMarkers(TEST_DIR, false);
    const fileResult2 = results.find(r => r.path.endsWith('CLAUDE.md'));
    expect(fileResult2?.error).toContain('Must contain exactly one managed begin marker');

    // Valid markers
    await writeFile(claudeFile, '<!-- CODECONDUCTOR:BEGIN managed -->\ncontent\n<!-- CODECONDUCTOR:END managed -->', 'utf-8');
    results = await validateAgentMarkers(TEST_DIR, false);
    const fileResult3 = results.find(r => r.path.endsWith('CLAUDE.md'));
    expect(fileResult3).toBeUndefined();
  });

  test('checkUpdates detects missing/modified generated council files', async () => {
    // 1. Setup a minimal codeconductor config.yml & preset council.yml
    const codeconductorDir = join(TEST_DIR, '.codeconductor');
    await mkdir(join(codeconductorDir, 'presets'), { recursive: true });
    
    // Write standard/mock config.yml
    await writeFile(join(codeconductorDir, 'config.yml'), 'defaults:\n  target: agy\n  locale: en\n');

    // Write a mock council.yml preset spec
    const mockCouncilSpec = `
name: mock-council
version: 1.0.0
description: Mock Council
agents:
  - id: architect
    role: Architect
    focus: [code]
    context: repo-readonly
    modelHint: strong-reasoning
outputContract: Markdown verdict
`;
    await writeFile(join(codeconductorDir, 'presets', 'council.yml'), mockCouncilSpec.trim());

    // 2. Mock target agy installed locally (by creating the .agents folder)
    const agyDir = join(TEST_DIR, '.agents');
    await mkdir(join(agyDir, 'workflows'), { recursive: true });

    // Run checkUpdates: should detect that cc-council.md (generated) is missing
    const resultMissing = await checkUpdates(TEST_DIR, false);
    
    const agyTargetResult = resultMissing.targets.find(t => t.target === 'agy');
    expect(agyTargetResult).toBeDefined();
    expect(agyTargetResult?.hasUpdate).toBe(true);
    expect(agyTargetResult?.files.some(f => f.endsWith('council-architect.md'))).toBe(true);

    // 3. Create the file with different/out-of-sync content
    const agentPath = join(agyDir, 'agents', 'council-architect.md');
    await mkdir(join(agyDir, 'agents'), { recursive: true });
    await writeFile(agentPath, 'out of sync content', 'utf-8');

    // Run checkUpdates: should detect it's out of sync
    const resultOutOfSync = await checkUpdates(TEST_DIR, false);
    const agyTargetResult2 = resultOutOfSync.targets.find(t => t.target === 'agy');
    expect(agyTargetResult2?.hasUpdate).toBe(true);
    expect(agyTargetResult2?.files.some(f => f.endsWith('council-architect.md'))).toBe(true);
  });

  test('updateCommand re-generates and updates council files', async () => {
    const { updateCommand } = await import('../src/commands/update.command');

    // 1. Setup a minimal config.yml & preset council.yml
    const codeconductorDir = join(TEST_DIR, '.codeconductor');
    await mkdir(join(codeconductorDir, 'presets'), { recursive: true });
    
    const validConfig = `
version: 0.3.0
project:
  name: test-project
  profile: node
defaults:
  target: agy
  overwrite: true
  locale: en
presets:
  council:
    enabled: true
    version: 0.3.0
safety:
  destructiveCommands: []
  secretPatterns: []
`;
    await writeFile(join(codeconductorDir, 'config.yml'), validConfig.trim());

    const mockCouncilSpec = `
name: mock-council
version: 1.0.0
description: Mock Council
agents:
  - id: architect
    role: Architect
    focus: [code]
    context: repo-readonly
    modelHint: strong-reasoning
outputContract: Markdown verdict
`;
    await writeFile(join(codeconductorDir, 'presets', 'council.yml'), mockCouncilSpec.trim());

    // 2. Mock target agy installed (empty folder)
    const agyDir = join(TEST_DIR, '.agents');
    await mkdir(join(agyDir, 'agents'), { recursive: true });

    // 3. Run updateCommand (force = true)
    const result = await updateCommand({
      dryRun: false,
      force: true,
      global: false,
      output: 'json',
      projectRoot: TEST_DIR,
    });

    expect(result.code).toBe(0);
    const data = result.data as any;
    expect(data.success).toBe(true);

    // Verify council-architect.md exists and is updated
    const agentPath = join(agyDir, 'agents', 'council-architect.md');
    const { existsSync, readFileSync } = await import('node:fs');
    expect(existsSync(agentPath)).toBe(true);
    expect(readFileSync(agentPath, 'utf-8')).toContain('Architect');
  });
});


