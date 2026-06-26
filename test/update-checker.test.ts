import { describe, expect, test, afterEach, beforeEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  getTargetInstallationPath,
  isTargetInstalled,
  validateAgentFileSizes,
  checkUpdates,
  loadSkillsLock
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
});

