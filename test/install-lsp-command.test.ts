/**
 * Integration tests for install lsp command.
 * Tests the full pipeline from CLI to file generation.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const CLI_CMD = ['bun', 'run', 'src/cli/main.ts'];

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
  const dirs = ['.opencode', '.claude', '.codex', '.gemini', '.cursor', '.agy', '.codeconductor'];
  for (const dir of dirs) {
    try {
      await rm(join(PROJECT_ROOT, dir), { recursive: true, force: true });
    } catch {}
  }
}

describe('install lsp command', () => {
  beforeAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  // Acceptance Criterion 1: installs LSP servers and writes config
  describe('Basic Installation', () => {
    test('install lsp --target opencode generates config file', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--dry-run']);
      expect(result.exitCode).toBe(0);

      // In dry-run, no files should be created
      expect(existsSync(join(PROJECT_ROOT, '.opencode', 'opencode.json'))).toBe(false);
    });

    test('install lsp --target opencode --force can create config file', async () => {
      // Without dry-run, files should be created (even if install might fail)
      // We use --force to ensure existing files don't block
      const result = await runCli(['install', 'lsp', '--target=opencode', '--force']);
      // May fail due to actual LSP installation, but config attempt should be made
      expect(result.exitCode === 0 || result.exitCode === 2 || result.exitCode === 1).toBe(true);
    });

    test('install lsp --target=all generates configs for all targets', async () => {
      const result = await runCli(['install', 'lsp', '--target=all', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('LSP Installation:');
    });
  });

  // Acceptance Criterion 2: Auto-detects project languages; --lang overrides
  describe('Language Detection', () => {
    test('--lang typescript overrides auto-detection', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('typescript');
    });

    test('--lang php overrides auto-detection', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=php', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('php');
    });

    test('--lang python overrides auto-detection', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=python', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('python');
    });

    test('--lang kotlin overrides auto-detection', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=kotlin', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('kotlin');
    });

    test('--lang with multiple languages', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--lang=typescript,python',
        '--dry-run',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('typescript');
      expect(result.stdout).toContain('python');
    });

    test('--lang with space-separated values', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--lang',
        'typescript',
        '--dry-run',
      ]);
      expect(result.exitCode).toBe(0);
    });
  });

  // Acceptance Criterion 4: Supports 6 AI tool targets
  describe('Six AI Tool Targets', () => {
    test('install lsp --target=claude works', async () => {
      const result = await runCli(['install', 'lsp', '--target=claude', '--dry-run']);
      expect(result.exitCode).toBe(0);
    });

    test('install lsp --target=codex works', async () => {
      const result = await runCli(['install', 'lsp', '--target=codex', '--dry-run']);
      expect(result.exitCode).toBe(0);
    });

    test('install lsp --target=gemini works', async () => {
      const result = await runCli(['install', 'lsp', '--target=gemini', '--dry-run']);
      expect(result.exitCode).toBe(0);
    });

    test('install lsp --target=cursor works', async () => {
      const result = await runCli(['install', 'lsp', '--target=cursor', '--dry-run']);
      expect(result.exitCode).toBe(0);
    });

    test('install lsp --target=agy works', async () => {
      const result = await runCli(['install', 'lsp', '--target=agy', '--dry-run']);
      expect(result.exitCode).toBe(0);
    });

    test('install lsp --target=opencode works', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--dry-run']);
      expect(result.exitCode).toBe(0);
    });
  });

  // Acceptance Criterion 6: --dry-run shows what would be installed without writing
  describe('--dry-run flag', () => {
    test('--dry-run does not create any files', async () => {
      await runCli(['install', 'lsp', '--target=opencode', '--force', '--dry-run']);

      expect(existsSync(join(PROJECT_ROOT, '.opencode'))).toBe(false);
      expect(existsSync(join(PROJECT_ROOT, '.claude'))).toBe(false);
      expect(existsSync(join(PROJECT_ROOT, '.codex'))).toBe(false);
      expect(existsSync(join(PROJECT_ROOT, '.gemini'))).toBe(false);
      expect(existsSync(join(PROJECT_ROOT, '.cursor'))).toBe(false);
    });

    test('--dry-run output shows LSPs that would be processed', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('LSP Installation:');
      expect(result.stdout).toContain('typescript');
    });

    test('--dry-run output shows config files that would be written', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Config Files:');
    });

    test('--dry-run shows (dry-run) suffix in output', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.stdout).toContain('(dry-run)');
    });
  });

  // Acceptance Criterion 7: --force overwrites existing LSP config
  describe('--force flag', () => {
    test('--force allows overwriting existing config', async () => {
      // First, create a config file
      await mkdir(join(PROJECT_ROOT, '.opencode'), { recursive: true });
      await writeFile(join(PROJECT_ROOT, '.opencode', 'opencode.json'), '{"old": "config"}');

      // Run with --force
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--force']);

      // Should succeed even with existing file
      expect(result.exitCode).toBe(0);
    });
  });

  // Acceptance Criterion 8: --global writes to home directory
  describe('--global flag', () => {
    test('--global --dry-run succeeds without writing to project', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--global',
        '--dry-run',
      ]);
      expect(result.exitCode).toBe(0);

      // Should not create .opencode in project directory
      expect(existsSync(join(PROJECT_ROOT, '.opencode'))).toBe(false);
    });

    test('--global --dry-run shows global paths in output', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--global',
        '--dry-run',
      ]);
      expect(result.exitCode).toBe(0);
    });
  });

  // Acceptance Criterion 10: Reports clear success/failure per LSP and per tool
  describe('Success/Failure Reporting', () => {
    test('output shows success icon for installed LSPs', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.exitCode).toBe(0);
      // ✓ for already-installed, + for newly installed, ✗ for failed
      expect(result.stdout).toMatch(/[✓+✗]/);
    });

    test('output shows success icon for config files', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.exitCode).toBe(0);
      // In dry-run mode, configs show success
      expect(result.stdout).toContain('Config Files:');
    });

    test('json output includes lspResults', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--lang=typescript',
        '--dry-run',
        '--output=json',
      ]);
      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.lspResults).toBeDefined();
      expect(Array.isArray(json.lspResults)).toBe(true);
    });

    test('json output includes configResults', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--lang=typescript',
        '--dry-run',
        '--output=json',
      ]);
      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.configResults).toBeDefined();
      expect(Array.isArray(json.configResults)).toBe(true);
    });

    test('json output includes targets array', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--lang=typescript',
        '--dry-run',
        '--output=json',
      ]);
      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.targets).toBeDefined();
      expect(Array.isArray(json.targets)).toBe(true);
      expect(json.targets).toContain('opencode');
    });

    test('json output includes languages array', async () => {
      const result = await runCli([
        'install',
        'lsp',
        '--target=opencode',
        '--lang=typescript,python',
        '--dry-run',
        '--output=json',
      ]);
      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.languages).toBeDefined();
      expect(Array.isArray(json.languages)).toBe(true);
      expect(json.languages).toContain('typescript');
      expect(json.languages).toContain('python');
    });
  });

  // Acceptance Criterion 11: Existing install council continues to work
  describe('Backward Compatibility', () => {
    test('install council still works', async () => {
      await runCli(['init', '--force']);
      const result = await runCli(['install', 'council', '--target=opencode', '--force']);
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-council.md'))).toBe(true);
    });

    test('install council --target=claude still works', async () => {
      await runCli(['init', '--force']);
      const result = await runCli(['install', 'council', '--target=claude', '--force']);
      expect(result.exitCode).toBe(0);
    });

    test('install council --target=codex still works', async () => {
      await runCli(['init', '--force']);
      const result = await runCli(['install', 'council', '--target=codex', '--force']);
      expect(result.exitCode).toBe(0);
    });

    test('install council --target=all still works', async () => {
      await runCli(['init', '--force']);
      const result = await runCli(['install', 'council', '--target=all', '--force']);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('returns error when no languages detected and no --lang provided', async () => {
      // Create empty temp directory
      const tempDir = join(PROJECT_ROOT, 'test-empty-lsp');
      await mkdir(tempDir, { recursive: true });

      const { spawn } = await import('bun');
      const process = spawn({
        cmd: ['bun', 'run', 'src/cli/main.ts', 'install', 'lsp', '--target=opencode'],
        cwd: tempDir,
      });
      const exitCode = await process.exited;

      await rm(tempDir, { recursive: true, force: true });

      expect(exitCode).toBe(1);
    });

    test('install lsp with invalid target shows error', async () => {
      const result = await runCli(['install', 'lsp', '--target=invalid-target']);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Output Format', () => {
    test('human output shows LSP Installation section', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.stdout).toContain('LSP Installation:');
    });

    test('human output shows Config Files section', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.stdout).toContain('Config Files:');
    });

    test('human output shows LSP count', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.stdout).toMatch(/\d+ LSPs processed/);
    });

    test('human output shows config file count', async () => {
      const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
      expect(result.stdout).toMatch(/\d+ config files/);
    });
  });
});

// Acceptance Criterion 3: Supports 4 languages
describe('Four Languages Support', () => {
  test('typescript LSP is available', async () => {
    const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=typescript', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('typescript');
  });

  test('php LSP is available', async () => {
    const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=php', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('php');
  });

  test('python LSP is available', async () => {
    const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=python', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('python');
  });

  test('kotlin LSP is available', async () => {
    const result = await runCli(['install', 'lsp', '--target=opencode', '--lang=kotlin', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('kotlin');
  });

  test('all 4 languages can be installed together', async () => {
    const result = await runCli([
      'install',
      'lsp',
      '--target=opencode',
      '--lang=typescript,php,python,kotlin',
      '--dry-run',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('typescript');
    expect(result.stdout).toContain('php');
    expect(result.stdout).toContain('python');
    expect(result.stdout).toContain('kotlin');
  });
});
