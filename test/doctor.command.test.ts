import { describe, expect, test, afterEach, beforeEach } from 'bun:test';
import { mkdir, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { doctorCommand } from '../src/commands/doctor.command';

let projectRoot: string;
let fakeHome: string;

const MINIMAL_CONFIG = `
version: 0.3.0
project:
  name: test-project
defaults:
  target: claude
  overwrite: false
  locale: en
presets:
  council:
    enabled: false
    version: 0.3.0
safety:
  destructiveCommands: []
  secretPatterns: []
`.trim();

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'cc-doctor-'));
  fakeHome = await mkdtemp(join(tmpdir(), 'cc-doctor-home-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  await rm(fakeHome, { recursive: true, force: true });
});

async function writeMinimalConfig(): Promise<void> {
  const codeconductorDir = join(projectRoot, '.codeconductor');
  await mkdir(join(codeconductorDir, 'presets'), { recursive: true });
  await writeFile(join(codeconductorDir, 'config.yml'), MINIMAL_CONFIG, 'utf-8');
}

describe('doctor.command skills-registry check', () => {
  test('skills-registry check passes and includes skill count in message', async () => {
    await writeMinimalConfig();

    const result = await doctorCommand({ projectRoot, output: 'json', homeDir: fakeHome });

    const skillsCheck = (result.data as any).checks?.find((c: any) => c.name === 'skills-registry');
    expect(skillsCheck).toBeDefined();
    expect(skillsCheck?.status).toBe('pass');
    expect(skillsCheck?.message).toContain('Skills registry is valid');
    expect(skillsCheck?.message).toMatch(/\(\d+ skills\)/);
    const hookCheck = (result.data as { checks: Array<{ name: string; status: string; message: string }> }).checks.find(c => c.name === 'hook-runner');
    expect(hookCheck).toBeDefined();
  });
});

describe('doctor.command global-hook-paths check', () => {
  test('reports info when no global Claude settings exist', async () => {
    await writeMinimalConfig();
    const result = await doctorCommand({ projectRoot, output: 'json', homeDir: fakeHome });
    const check = (result.data as { checks: Array<{ name: string; status: string }> }).checks
      .find((c) => c.name === 'global-hook-paths');
    expect(check?.status).toBe('info');
  });

  test('warns on relative global hook commands and explains repair', async () => {
    await writeMinimalConfig();
    await mkdir(join(fakeHome, '.claude'), { recursive: true });
    await writeFile(
      join(fakeHome, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: 'node .claude/hooks/invoke-hook.cjs pre-tool' }],
            },
          ],
        },
      }),
      'utf-8'
    );

    const result = await doctorCommand({ projectRoot, output: 'json', homeDir: fakeHome });
    const check = (result.data as { checks: Array<{ name: string; status: string; message: string }> }).checks
      .find((c) => c.name === 'global-hook-paths');
    expect(check?.status).toBe('warn');
    expect(check?.message).toContain('relative');
    expect(check?.message).toContain('migrate --global');
    expect(check?.message).toContain('install preset --target claude --global --force');
  });

  test('passes when global hooks use an absolute existing script', async () => {
    await writeMinimalConfig();
    const script = join(fakeHome, '.claude', 'hooks', 'invoke-hook.cjs');
    await mkdir(join(fakeHome, '.claude', 'hooks'), { recursive: true });
    await writeFile(script, 'module.exports = {};', 'utf-8');
    await writeFile(
      join(fakeHome, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: `node ${script} pre-tool` }],
            },
          ],
        },
      }),
      'utf-8'
    );

    const result = await doctorCommand({ projectRoot, output: 'json', homeDir: fakeHome });
    const check = (result.data as { checks: Array<{ name: string; status: string }> }).checks
      .find((c) => c.name === 'global-hook-paths');
    expect(check?.status).toBe('pass');
  });
});
