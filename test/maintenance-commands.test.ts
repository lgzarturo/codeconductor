import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invokeCli } from './helpers/invoke-cli';

let root: string;

describe('maintenance commands', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cc-maintenance-'));
    await writeFile(join(root, 'package.json'), '{"name":"fixture"}');
  });
  beforeEach(async () => {
    await rm(join(root, '.codeconductor'), { recursive: true, force: true });
    await rm(join(root, '.opencode'), { recursive: true, force: true });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('version has machine-readable project harness information', async () => {
    await invokeCli(['init', '--force'], root);
    const result = await invokeCli(['version', '--json'], root);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.command).toBe('version');
    expect(data.project.initialized).toBe(true);
    expect(data.project.harness).toBeDefined();
    expect(data.latest).toHaveProperty('codeconductor');
    expect(data.skills).toHaveProperty('outdated');
  });

  test('update --check does not apply conflicts while it reports release state', async () => {
    await invokeCli(['init', '--force'], root);
    await writeFile(join(root, '.codeconductor', 'presets', 'council.yml'), 'name: local\n');
    const result = await invokeCli(['update', '--check', '--json'], root);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.check).toBe(true);
    expect(data.sync.conflicts).toHaveLength(1);
  });

  test('status reports installed target and modified managed files without doctor', async () => {
    await invokeCli(['setup', '--target', 'opencode', '--yes'], root);
    await writeFile(join(root, '.codeconductor', 'presets', 'council.yml'), 'name: custom\n');
    const result = await invokeCli(['status', '--json'], root);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.targets.find((target: { target: string }) => target.target === 'opencode').installed).toBe(true);
    expect(data.modifiedFiles).toContain('.codeconductor/presets/council.yml');
  });

  test('setup dry-run writes no harness files', async () => {
    const result = await invokeCli(['setup', '--target', 'opencode', '--locale', 'es', '--yes', '--dry-run', '--json'], root);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).dryRun).toBe(true);
    await expect(Bun.file(join(root, '.codeconductor', 'config.yml')).exists()).resolves.toBe(false);
  });

  test('nested help, docs, and completion are generated from the command inventory', async () => {
    const help = await invokeCli(['install', 'preset', '--help'], root);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('Install agents, prompts, skills, and commands.');

    const docs = await invokeCli(['docs', 'setup'], root);
    expect(docs.stdout).toContain('## setup');

    const completion = await invokeCli(['completion', 'fish'], root);
    expect(completion.stdout).toContain('complete -c cc -a setup');
    expect(completion.stdout).toContain("complete -c cc -l target");

    const workflowDocs = await invokeCli(['docs', 'workflows'], root);
    expect(workflowDocs.stdout).toContain('## openspec');

    const allHelp = await invokeCli(['help', '--all'], root);
    expect(allHelp.stdout).toContain('## install');
  });

  test('bare command provides contextual onboarding instead of the full reference', async () => {
    const fresh = await mkdtemp(join(tmpdir(), 'cc-onboarding-'));
    try {
      await writeFile(join(fresh, 'package.json'), '{"name":"fixture"}');
      const uninitialized = await invokeCli([], fresh);
      expect(uninitialized.stdout).toContain('CodeConductor is not initialized');
      expect(uninitialized.stdout).toContain('cc setup --dry-run');

      await invokeCli(['init', '--force'], fresh);
      const initialized = await invokeCli([], fresh);
      expect(initialized.stdout).toContain('Project harness');
      expect(initialized.stdout).toContain('cc update --check');
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });
});
