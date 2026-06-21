import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { calculateConfidence, detectProject } from '../src/core/detection/project-detector';
import { mergeManagedBlock } from '../src/core/filesystem/safe-merger';
import { resolvePreset } from '../src/core/presets/preset-resolver';
import { validatePromptChangelog } from '../src/core/prompts/changelog-discipline';

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
  for (const dir of ['.opencode', '.claude', '.codex', '.codeconductor']) {
    try {
      await rm(join(PROJECT_ROOT, dir), { recursive: true, force: true });
    } catch {}
  }
}

describe('v0.3.0 roadmap completion', () => {
  beforeEach(async () => {
    await cleanup();
  });

  test('detectProject assigns deterministic confidence levels', async () => {
    const nodeProfile = await detectProject(join(PROJECT_ROOT, 'test', 'fixtures', 'node-project'));
    expect(nodeProfile.confidence).toBe('medium');

    const springProfile = await detectProject(
      join(PROJECT_ROOT, 'test', 'fixtures', 'spring-project')
    );
    expect(springProfile.confidence).toBe('medium');

    expect(
      calculateConfidence({
        signals: ['package.json', 'bun.lock', 'astro.config'],
        runtimes: ['node', 'bun'],
        frameworks: ['astro'],
      })
    ).toBe('high');
  });

  test('detectProject identifies Next.js, FastAPI, Monorepo, Generic Backend, and Generic Frontend', async () => {
    const nextProfile = await detectProject(join(PROJECT_ROOT, 'test', 'fixtures', 'nextjs-project'));
    expect(nextProfile.frameworks).toContain('nextjs');
    expect(nextProfile.runtimes).toContain('node');

    const fastapiProfile = await detectProject(join(PROJECT_ROOT, 'test', 'fixtures', 'fastapi-project'));
    expect(fastapiProfile.frameworks).toContain('fastapi');
    expect(fastapiProfile.runtimes).toContain('python');

    const monorepoProfile = await detectProject(join(PROJECT_ROOT, 'test', 'fixtures', 'monorepo-project'));
    expect(monorepoProfile.signals).toContain('pnpm-workspace.yaml');

    const backendProfile = await detectProject(join(PROJECT_ROOT, 'test', 'fixtures', 'backend-project'));
    expect(backendProfile.frameworks).toContain('backend');
    expect(backendProfile.languages).toContain('go');

    const frontendProfile = await detectProject(join(PROJECT_ROOT, 'test', 'fixtures', 'frontend-project'));
    expect(frontendProfile.frameworks).toContain('frontend');
    expect(frontendProfile.runtimes).toContain('node');
  });

  test('preset resolver returns target, stack, architecture, version, assets, and warnings', () => {
    const resolution = resolvePreset('opencode', {
      runtimes: ['node'],
      frameworks: [],
      signals: ['package.json'],
      confidence: 'medium',
    });

    expect(resolution.target).toBe('opencode');
    expect(resolution.stack).toBe('node');
    expect(resolution.architecture).toBe('single-project');
    expect(resolution.presetVersion).toBe('v0.3.0');
    expect(resolution.assets).toContain('commands');
    expect(resolution.warnings.length).toBeGreaterThan(0);
  });

  test('preset resolver resolves new stacks and monorepo architecture correctly', () => {
    const nextResolution = resolvePreset('opencode', {
      runtimes: ['node'],
      frameworks: ['nextjs'],
      signals: ['next.config', 'package.json'],
      confidence: 'high',
    });
    expect(nextResolution.stack).toBe('nextjs');
    expect(nextResolution.architecture).toBe('single-project');

    const monorepoResolution = resolvePreset('opencode', {
      runtimes: ['node'],
      frameworks: ['nextjs'],
      signals: ['pnpm-workspace.yaml', 'next.config', 'package.json'],
      confidence: 'high',
    });
    expect(monorepoResolution.architecture).toBe('monorepo');
    expect(monorepoResolution.stack).toBe('nextjs');
  });

  test('safe merger replaces only the managed block and preserves user content', () => {
    const existing = [
      '# User intro',
      '<!-- CODECONDUCTOR:BEGIN managed -->',
      'old managed content',
      '<!-- CODECONDUCTOR:END managed -->',
      'User notes',
    ].join('\n');
    const incoming = [
      '<!-- CODECONDUCTOR:BEGIN managed -->',
      'new managed content',
      '<!-- CODECONDUCTOR:END managed -->',
    ].join('\n');

    const result = mergeManagedBlock(existing, incoming);

    expect(result.action).toBe('merged');
    expect(result.content).toContain('# User intro');
    expect(result.content).toContain('new managed content');
    expect(result.content).not.toContain('old managed content');
    expect(result.content).toContain('User notes');
  });

  test('safe merger fails closed when markers are malformed', () => {
    expect(() =>
      mergeManagedBlock(
        '<!-- CODECONDUCTOR:BEGIN managed -->\nonly one marker',
        '<!-- CODECONDUCTOR:BEGIN managed -->\nnew\n<!-- CODECONDUCTOR:END managed -->'
      )
    ).toThrow('exactly one managed begin marker');
  });

  test('prompt changelog discipline requires CHANGELOG.md for prompt contract changes', () => {
    const invalid = validatePromptChangelog(['presets/opencode/commands/cc-feature.md']);
    expect(invalid.required).toBe(true);
    expect(invalid.valid).toBe(false);

    const valid = validatePromptChangelog([
      'presets/opencode/commands/cc-feature.md',
      'CHANGELOG.md',
    ]);
    expect(valid.valid).toBe(true);
  });

  test('detect --output json includes confidence and signals', async () => {
    const result = await runCli(['detect', '--output=json']);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.detected.signals.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high']).toContain(json.detected.confidence);
  });

  test('init --dry-run exposes the resolved preset plan without writing files', async () => {
    const result = await runCli(['init', '--dry-run', '--output=json']);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.presetResolution.target).toBe('opencode');
    expect(json.presetResolution.presetVersion).toBe('v0.3.0');
    expect(json.presetResolution.confidence).toBeDefined();
    expect(existsSync(join(PROJECT_ROOT, '.codeconductor', 'config.yml'))).toBe(false);
  });

  test('install preset --dry-run exposes preset resolution in json', async () => {
    await runCli(['init', '--force']);

    const result = await runCli([
      'install',
      'preset',
      '--target=codex',
      '--dry-run',
      '--output=json',
    ]);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.presetResolution[0].target).toBe('codex');
    expect(json.presetResolution[0].architecture).toBe('single-project');
    expect(json.presetResolution[0].assets).toContain('AGENTS.md');
  });

  test('doctor reports structured target security compatibility gaps', async () => {
    await runCli(['init', '--force']);

    const result = await runCli(['doctor', '--output=json']);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(Array.isArray(json.securityCompatibility)).toBe(true);
    expect(
      json.securityCompatibility.find((target: { target: string }) => target.target === 'codex')
        .unsupportedRules
    ).toContain('runtime.network');
    expect(
      json.checks.find((check: { name: string }) => check.name === 'security-codex').status
    ).toBe('warn');
  });

  test('install preset copies API contract and database migration workflows', async () => {
    await runCli(['init', '--force']);
    const result = await runCli(['install', 'preset', '--target=all', '--force']);
    expect(result.exitCode).toBe(0);

    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-api-contract.md'))).toBe(
      true
    );
    expect(existsSync(join(PROJECT_ROOT, '.opencode', 'commands', 'cc-db-migration.md'))).toBe(
      true
    );
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'commands', 'cc', 'api-contract.md'))).toBe(
      true
    );
    expect(existsSync(join(PROJECT_ROOT, '.claude', 'commands', 'cc', 'db-migration.md'))).toBe(
      true
    );
  });

  test('merge-managed manifest updates only managed Codex AGENTS block', async () => {
    await runCli(['init', '--force']);

    await mkdir(join(PROJECT_ROOT, '.codex'), { recursive: true });
    await writeFile(
      join(PROJECT_ROOT, '.codex', 'AGENTS.md'),
      [
        '# Local heading',
        '',
        '<!-- CODECONDUCTOR:BEGIN managed -->',
        'old generated block',
        '<!-- CODECONDUCTOR:END managed -->',
        '',
        'Local footer {{MODEL_CODEX}}',
      ].join('\n')
    );

    const result = await runCli(['install', 'preset', '--target=codex']);
    expect(result.exitCode).toBe(0);

    const content = await readFile(join(PROJECT_ROOT, '.codex', 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# Local heading');
    expect(content).toContain('Local footer {{MODEL_CODEX}}');
    expect(content).toContain('Workflow Contract');
    expect(content).not.toContain('old generated block');
  });

  test('source workflows include bug-fix and refactor discipline', async () => {
    const fix = await readFile(
      join(PROJECT_ROOT, 'presets', 'opencode', 'commands', 'cc-fix.md'),
      'utf-8'
    );
    const refactor = await readFile(
      join(PROJECT_ROOT, 'presets', 'opencode', 'commands', 'cc-refactor.md'),
      'utf-8'
    );

    expect(fix).toContain('regression');
    expect(fix).toContain('root cause');
    expect(refactor).toContain('behavior');
    expect(refactor).toContain('scope');
  });
});
