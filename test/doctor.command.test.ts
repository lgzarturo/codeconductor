import { describe, expect, test, afterEach, beforeEach } from 'bun:test';
import { mkdir, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { doctorCommand } from '../src/commands/doctor.command';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'cc-doctor-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('doctor.command skills-registry check', () => {
  test('skills-registry check passes and includes skill count in message', async () => {
    const codeconductorDir = join(projectRoot, '.codeconductor');
    await mkdir(join(codeconductorDir, 'presets'), { recursive: true });

    const configYml = `
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
    await writeFile(join(codeconductorDir, 'config.yml'), configYml, 'utf-8');

    const result = await doctorCommand({ projectRoot, output: 'json' });

    const skillsCheck = (result.data as any).checks?.find((c: any) => c.name === 'skills-registry');
    expect(skillsCheck).toBeDefined();
    expect(skillsCheck?.status).toBe('pass');
    expect(skillsCheck?.message).toContain('Skills registry is valid');
    expect(skillsCheck?.message).toMatch(/\(\d+ skills\)/);
  });
});
