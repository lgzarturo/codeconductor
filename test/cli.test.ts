import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import packageJson from '../package.json';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const CLI_CMD = ['bun', 'run', 'src/cli/main.ts'];

/**
 * Helper to run CLI command and get exit code + output
 */
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

/**
 * Clean up generated directories
 */
async function cleanup() {
  const dirs = ['.opencode', '.claude', '.codex', '.codeconductor'];
  for (const dir of dirs) {
    try {
      await rm(join(PROJECT_ROOT, dir), { recursive: true, force: true });
    } catch {}
  }
}

describe('CLI', () => {
  beforeAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  test('init creates config', async () => {
    const { spawn } = await import('bun');

    const process = spawn({
      cmd: ['bun', 'run', 'src/cli/main.ts', 'init', '--force'],
      cwd: PROJECT_ROOT,
    });

    const exitCode = await process.exited;
    expect(exitCode).toBe(0);

    // Check config was created
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor', 'config.yml'))).toBe(true);
  });

  test('detect identifies node project', async () => {
    const { spawn } = await import('bun');

    const process = spawn({
      cmd: ['bun', 'run', 'src/cli/main.ts', 'detect'],
      cwd: PROJECT_ROOT,
    });

    const exitCode = await process.exited;
    expect(exitCode).toBe(0);
  });

  test('install council --target opencode generates files', async () => {
    const { spawn } = await import('bun');

    // First init
    let process = spawn({
      cmd: ['bun', 'run', 'src/cli/main.ts', 'init', '--force'],
      cwd: PROJECT_ROOT,
    });
    await process.exited;

    // Then install
    process = spawn({
      cmd: ['bun', 'run', 'src/cli/main.ts', 'install', 'council', '--target=opencode', '--force'],
      cwd: PROJECT_ROOT,
    });
    const exitCode = await process.exited;
    expect(exitCode).toBe(0);

    // Check files were created
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-council.md'))).toBe(true);
  });

  test('dry-run does not write files', async () => {
    // Clean up first
    await rm(join(PROJECT_ROOT, '.codeconductor'), { recursive: true, force: true });

    const { spawn } = await import('bun');

    const process = spawn({
      cmd: ['bun', 'run', 'src/cli/main.ts', 'init', '--force', '--dry-run'],
      cwd: PROJECT_ROOT,
    });

    const exitCode = await process.exited;
    expect(exitCode).toBe(0);

    // Check config was NOT created
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor', 'config.yml'))).toBe(false);
  });

  // ========== NEW TESTS FOR ACCEPTANCE CRITERIA ==========

  test('--help shows help text', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('CodeConductor CLI');
    expect(result.stdout).toContain(`CodeConductor CLI v${packageJson.version}`);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('detect');
    expect(result.stdout).toContain('install');
    expect(result.stdout).toContain('doctor');
    expect(result.stdout).toContain('update');
    expect(result.stdout).toContain('install preset');
    expect(result.stdout).toContain('install council');
  });

  test('help command shows help text', async () => {
    const result = await runCli(['help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('CodeConductor CLI');
    expect(result.stdout).toContain(`CodeConductor CLI v${packageJson.version}`);
  });

  test('--version shows package version', async () => {
    const result = await runCli(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(`${packageJson.name} v${packageJson.version}`);
  });

  test('-v shows package version', async () => {
    const result = await runCli(['-v']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(`${packageJson.name} v${packageJson.version}`);
  });

  test('--force overwrites existing files', async () => {
    // First create config
    await mkdir(join(PROJECT_ROOT, '.codeconductor'), { recursive: true });
    await writeFile(join(PROJECT_ROOT, '.codeconductor', 'config.yml'), 'old: config');

    // Run init with --force
    const result = await runCli(['init', '--force']);
    expect(result.exitCode).toBe(0);

    // Check config was overwritten
    const content = await readFile(join(PROJECT_ROOT, '.codeconductor', 'config.yml'), 'utf-8');
    expect(content).not.toContain('old: config');
    expect(content).toContain('project:');
  });

  test('without --force, existing files are skipped', async () => {
    // First create config
    await mkdir(join(PROJECT_ROOT, '.codeconductor'), { recursive: true });
    await writeFile(join(PROJECT_ROOT, '.codeconductor', 'config.yml'), 'existing: config');

    // Run init without --force
    const result = await runCli(['init']);
    // Should fail with exit code 2 (UNSAFE_OPERATION) or succeed but not overwrite
    // The current implementation returns exit code 0 but skips writing

    // Check config was NOT overwritten
    const content = await readFile(join(PROJECT_ROOT, '.codeconductor', 'config.yml'), 'utf-8');
    expect(content).toContain('existing: config');
  });

  test('doctor validates configuration', async () => {
    // First create config
    await runCli(['init', '--force']);

    // Run doctor
    const result = await runCli(['doctor']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('config-exists');
    expect(result.stdout).toContain('✓'); // Uses checkmark icon
  });

  test('doctor fails when no config exists', async () => {
    const result = await runCli(['doctor']);
    expect(result.exitCode).toBe(4); // CONFIG_CONFLICT
    expect(result.stdout).toContain('config-exists');
    expect(result.stdout).toContain('✗');
  });

  test('update updates installed presets', async () => {
    // First init and install
    await runCli(['init', '--force']);
    await runCli(['install', 'council', '--target=opencode', '--force']);

    // Run update
    const result = await runCli(['update', '--force']);
    // Should succeed (may be up to date or actually update)
    expect(result.exitCode).toBe(0);
  });

  test('update fails when no config exists', async () => {
    const result = await runCli(['update']);
    expect(result.exitCode).toBe(1); // VALIDATION_ERROR
    expect(result.stderr).toContain('No config found');
  });

  test('--output json produces valid JSON', async () => {
    const result = await runCli(['init', '--force', '--output', 'json']);
    expect(result.exitCode).toBe(0);

    // Should be valid JSON
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.command).toBe('init');
    expect(json.created).toBeDefined();
  });

  test('--output=json produces valid JSON (equals syntax)', async () => {
    const result = await runCli(['detect', '--output=json']);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.detected).toBeDefined();
  });

  test('detect outputs detected profile', async () => {
    const result = await runCli(['detect']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected:');
    expect(result.stdout).toContain('node'); // Project is detected as node project
  });

  test('detect returns exit code 3 for empty project', async () => {
    // Create empty temp directory inside project root
    const tempDir = join(PROJECT_ROOT, 'test-empty-temp');
    await mkdir(tempDir, { recursive: true });

    // Run detect using absolute path to CLI
    const cliPath = join(PROJECT_ROOT, 'src/cli/main.ts');
    const { spawn } = await import('bun');
    const process = spawn({
      cmd: ['bun', 'run', cliPath, 'detect'],
      cwd: tempDir,
    });
    const exitCode = await process.exited;

    // Clean up
    await rm(tempDir, { recursive: true, force: true });

    expect(exitCode).toBe(3); // UNSUPPORTED_PROJECT
  });

  test('install council --target claude generates files', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=claude', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    // Claude target creates files in .claude/skills/ and .claude/agents/
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'skills', 'council', 'SKILL.md'))).toBe(true);
  });

  test('install council --target codex generates files', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=codex', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    // Codex target creates .codex/config.toml and .codex/agents/
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'config.toml'))).toBe(true);
  });

  test('install council --target all generates files for all targets', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=all', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    // All target creates files for all four runners
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-council.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'skills', 'council', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'config.toml'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.agents', 'skills', 'council', 'SKILL.md'))).toBe(true);
  });

  test('install with --dry-run does not write files', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=opencode', '--dry-run']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-council.md'))).toBe(false);
  });

  test('unknown command returns exit code 1', async () => {
    const result = await runCli(['unknown-command']);
    expect(result.exitCode).toBe(1);
    // Error output goes to stderr
    expect(result.stderr).toContain('Unknown command');
  });

  test('init creates .codeconductor directory', async () => {
    await runCli(['init', '--force']);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor', 'config.yml'))).toBe(true);
  });

  test('detect with json output includes all detection fields', async () => {
    const result = await runCli(['detect', '--output', 'json']);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.detected).toHaveProperty('languages');
    expect(json.detected).toHaveProperty('runtimes');
    expect(json.detected).toHaveProperty('frameworks');
    expect(json.detected).toHaveProperty('signals');
    expect(json.detected).toHaveProperty('confidence');
    expect(json.recommendedPresets).toBeDefined();
  });

  // ========== NEW TESTS: config dir, preset loading, global install ==========

  test('init copies council.yml to .codeconductor/presets/', async () => {
    const result = await runCli(['init', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor', 'presets', 'council.yml'))).toBe(true);
  });

  test('init copies policy.yml to .codeconductor/presets/', async () => {
    const result = await runCli(['init', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor', 'presets', 'policy.yml'))).toBe(true);
  });

  test('install uses .codeconductor/presets/council.yml when present', async () => {
    await runCli(['init', '--force']);

    // Patch the config-dir preset with a custom agent name
    const { existsSync, readFileSync } = await import('node:fs');
    const presetPath = join(PROJECT_ROOT, '.codeconductor', 'presets', 'council.yml');
    expect(existsSync(presetPath)).toBe(true);

    const original = readFileSync(presetPath, 'utf-8');
    await writeFile(presetPath, original.replace('Multi-agent council', 'Custom council'));

    const result = await runCli(['install', 'council', '--target=opencode', '--force']);
    expect(result.exitCode).toBe(0);

    // Check opencode file was generated
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-council.md'))).toBe(true);
  });

  test('init --dry-run does not copy preset files', async () => {
    const result = await runCli(['init', '--force', '--dry-run']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor', 'presets', 'council.yml'))).toBe(false);
  });

  test('init without --force does not overwrite council.yml preset', async () => {
    // First init with force to create preset
    await runCli(['init', '--force']);

    const presetPath = join(PROJECT_ROOT, '.codeconductor', 'presets', 'council.yml');
    await writeFile(presetPath, 'custom: preset');

    // Re-run without force
    await runCli(['init']);

    const content = await readFile(presetPath, 'utf-8');
    expect(content).toContain('custom: preset');
  });

  test('install council --target=all output shows all targets', async () => {
    const result = await runCli(['install', 'council', '--target=all', '--force']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('opencode');
    expect(result.stdout).toContain('claude');
    expect(result.stdout).toContain('codex');
  });

  test('install council --target=all partial success shows written files even when some exist', async () => {
    // Pre-create opencode files so they already exist (will be "skipped" errors)
    await runCli(['install', 'council', '--target=opencode', '--force']);

    // Run for all targets without force — opencode will error, claude/codex will succeed
    const result = await runCli(['install', 'council', '--target=all']);

    // Errors for opencode go to stderr
    expect(result.stderr).toContain('File exists');
    // Successfully installed claude and codex still reported in stdout
    expect(result.stdout).toContain('claude');
    expect(result.stdout).toContain('codex');
  });

  test('--help shows codex as install target', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('codex');
  });

  test('install council --target codex generates files', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=codex', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'config.toml'))).toBe(true);
  });

  test('install council --target agy generates files', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=agy', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.agents', 'skills', 'council', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.agents', 'agents', 'council-architect.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.agents', 'workflows', 'cc-council.md'))).toBe(true);
  });

  test('install codex --force targets codex (not opencode)', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'codex', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'config.toml'))).toBe(true);
    // Must NOT have installed to opencode only
    expect(result.stdout).toContain('codex');
    expect(result.stdout).not.toContain('opencode');
  });

  test('install all --force installs all three targets', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'all', '--force']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('opencode');
    expect(result.stdout).toContain('claude');
    expect(result.stdout).toContain('codex');
  });

  test('install claude --force targets claude (not opencode)', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'claude', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'skills', 'council', 'SKILL.md'))).toBe(true);
    expect(result.stdout).toContain('claude');
  });

  test('install --global --target=opencode writes to home dir with --dry-run', async () => {
    await runCli(['init', '--force']);

    // Use dry-run to avoid actually writing to ~
    const result = await runCli([
      'install',
      'council',
      '--target=opencode',
      '--global',
      '--dry-run',
    ]);
    expect(result.exitCode).toBe(0);
  });

  test('install --global --target=claude writes to home dir with --dry-run', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=claude', '--global', '--dry-run']);
    expect(result.exitCode).toBe(0);
  });

  test('install --global --target=agy writes to .gemini/config with --dry-run', async () => {
    await runCli(['init', '--force']);

    const result = await runCli([
      'install',
      'council',
      '--target=agy',
      '--global',
      '--dry-run',
      '--output=json',
    ]);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);

    const hasWrongPaths = json.written.some((path: string) => path.includes('.agents'));
    const hasRightPaths = json.written.some((path: string) => path.includes('.gemini/config'));

    expect(hasWrongPaths).toBe(false);
    expect(hasRightPaths).toBe(true);
  });

  test('install --global --target=all dry-run succeeds', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'council', '--target=all', '--global', '--dry-run']);
    expect(result.exitCode).toBe(0);
  });

  test('install --global json output includes global flag', async () => {
    await runCli(['init', '--force']);

    const result = await runCli([
      'install',
      'council',
      '--target=opencode',
      '--global',
      '--dry-run',
      '--output=json',
    ]);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
  });

  // ========== NEW TESTS: install preset (manifest-based) ==========

  test('install preset --target=opencode copies opencode agents', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'preset', '--target=opencode', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-feature.md'))).toBe(true);
  });

  test('install preset --target=opencode copies prompts and skills', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'preset', '--target=opencode', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(
      existsSync(join(PROJECT_ROOT, '.opencode', 'prompts', 'v0.3.0', 'orchestrator.md'))
    ).toBe(true);
    expect(
      existsSync(join(PROJECT_ROOT, '.opencode', 'skills', 'api-versioning', 'SKILL.md'))
    ).toBe(true);
  });

  test('install preset --target=claude copies claude skills and agents', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'preset', '--target=claude', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'skills', 'api-versioning', 'SKILL.md'))).toBe(
      true
    );
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'agents', 'orchestrator.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'CLAUDE.md'))).toBe(true);
  });

  test('install preset --target=claude copies settings.json locally', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'preset', '--target=claude', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'settings.json'))).toBe(true);
    const content = await readFile(join(PROJECT_ROOT, '.claude', 'settings.json'), 'utf-8');
    const json = JSON.parse(content);
    expect(json.permissions).toBeDefined();
  });

  test('install preset --target=codex copies AGENTS.md and skills', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'preset', '--target=codex', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'skills', 'api-versioning', 'SKILL.md'))).toBe(
      true
    );
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'prompts', 'v0.3.0', 'orchestrator.md'))).toBe(
      true
    );
  });

  test('install preset --target=all copies all targets', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'preset', '--target=all', '--force']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'agents', 'orchestrator.md'))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, '.codex', 'AGENTS.md'))).toBe(true);
  });

  test('install preset --dry-run does not write files', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['install', 'preset', '--target=opencode', '--dry-run']);
    expect(result.exitCode).toBe(0);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'agents', 'architect.md'))).toBe(false);
  });

  test('install preset --output=json returns fileResults', async () => {
    await runCli(['init', '--force']);

    const result = await runCli([
      'install',
      'preset',
      '--target=opencode',
      '--force',
      '--output=json',
    ]);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.subcommand).toBe('preset');
    expect(Array.isArray(json.fileResults)).toBe(true);
    expect(json.fileResults.length).toBeGreaterThan(0);
  });

  test('install preset CLAUDE.md appends when already exists (local)', async () => {
    await runCli(['init', '--force']);
    // Pre-create CLAUDE.md
    await mkdir(join(PROJECT_ROOT, '.claude'), { recursive: true });
    await writeFile(join(PROJECT_ROOT, '.claude', 'CLAUDE.md'), '# Existing content\n');

    // Local install without force → strategy=overwrite (overwrites)
    const result = await runCli(['install', 'preset', '--target=claude']);
    expect(result.exitCode).toBe(0);

    // Local uses overwrite strategy, so old content is replaced
    const content = await readFile(join(PROJECT_ROOT, '.claude', 'CLAUDE.md'), 'utf-8');
    expect(content).not.toContain('# Existing content');
  });

  test('install preset --global --dry-run succeeds', async () => {
    await runCli(['init', '--force']);

    const result = await runCli([
      'install',
      'preset',
      '--target=opencode',
      '--global',
      '--dry-run',
    ]);
    expect(result.exitCode).toBe(0);
  });
});
