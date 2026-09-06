import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { loadManifest } from '../src/core/presets/manifest-loader';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const SHARED_HOOK = join(PROJECT_ROOT, 'presets/shared/invoke-hook.cjs');
const AGY_HOOK = join(PROJECT_ROOT, 'presets/agy/scripts/invoke-hook.cjs');
const AGENTS_HOOK = join(PROJECT_ROOT, '.agents/scripts/invoke-hook.cjs');

describe('invoke-hook fail-open and parity tests', () => {
  test('all 3 copies of invoke-hook.cjs are byte-identical', () => {
    const sharedContent = readFileSync(SHARED_HOOK, 'utf-8');
    const agyContent = readFileSync(AGY_HOOK, 'utf-8');
    const agentsContent = readFileSync(AGENTS_HOOK, 'utf-8');

    expect(agyContent).toBe(sharedContent);
    expect(agentsContent).toBe(sharedContent);
  });

  test('agy manifest sets globalStrategy: skip for hooks.json and scripts', async () => {
    const manifest = await loadManifest('agy');
    const hooksEntry = manifest.entries.find((e) => e.src === 'agy/hooks.json');
    const scriptsEntry = manifest.entries.find((e) => e.src === 'agy/scripts');

    expect(hooksEntry).toBeDefined();
    expect(hooksEntry?.globalStrategy).toBe('skip');

    expect(scriptsEntry).toBeDefined();
    expect(scriptsEntry?.globalStrategy).toBe('skip');
  });

  test('exact command from hooks.json in empty tmpdir returns exit 0 + {"action":"allow"}', () => {
    const hooksConfig = JSON.parse(readFileSync(join(PROJECT_ROOT, 'presets/agy/hooks.json'), 'utf-8'));
    const preToolCmd = hooksConfig['safety-gate']?.PreToolUse?.[0]?.hooks?.[0]?.command;
    expect(preToolCmd).toBeDefined();

    const tmpDir = mkdtempSync(join(tmpdir(), 'cc-hook-test-'));
    try {
      const result = spawnSync('sh', ['-c', preToolCmd], {
        cwd: tmpDir,
        env: { ...process.env, PROJECT_ROOT: tmpDir },
        encoding: 'utf-8',
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.decision).toBe('allow');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('post-tool in empty tmpdir returns exit 0 + {}', () => {
    const hooksConfig = JSON.parse(readFileSync(join(PROJECT_ROOT, 'presets/agy/hooks.json'), 'utf-8'));
    const postToolCmd = hooksConfig['code-formatter']?.PostToolUse?.[0]?.hooks?.[0]?.command;
    expect(postToolCmd).toBeDefined();

    const tmpDir = mkdtempSync(join(tmpdir(), 'cc-hook-test-'));
    try {
      const result = spawnSync('sh', ['-c', postToolCmd], {
        cwd: tmpDir,
        env: { ...process.env, PROJECT_ROOT: tmpDir },
        encoding: 'utf-8',
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed).toEqual({});
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('direct invocation node script.cjs pre-tool --format=agy in empty tmpdir returns exit 0 + allow', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cc-hook-test-'));
    try {
      const result = spawnSync(process.execPath, [SHARED_HOOK, 'pre-tool', '--format=agy'], {
        cwd: tmpDir,
        env: { ...process.env, PROJECT_ROOT: tmpDir },
        encoding: 'utf-8',
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.decision).toBe('allow');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('claude format fail-open in empty tmpdir returns exit 0', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cc-hook-test-'));
    try {
      const result = spawnSync(process.execPath, [SHARED_HOOK, 'pre-tool'], {
        cwd: tmpDir,
        env: { ...process.env, PROJECT_ROOT: tmpDir },
        encoding: 'utf-8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('deny policy continues to work for git push in codeconductor project', () => {
    const input = JSON.stringify({
      toolName: 'run_command',
      arguments: { CommandLine: 'git push origin main' },
    });
    const result = spawnSync(process.execPath, [SHARED_HOOK, 'pre-tool', '--format=agy'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PROJECT_ROOT },
      input,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.decision).toBe('deny');
  });
});
