import packageJson from '../../package.json';
import { loadSkillsLock } from '../core/presets/update-checker';
import { readInstallationState } from '../core/install/installation-state';
import { loadConfig } from '../core/config/config-loader';
import { checkUpdates } from '../core/presets/update-checker';
import { getLatestCliVersion } from '../core/install/registry-client';
import type { OutputMode } from '../utils/logger';

export interface VersionOptions {
  readonly projectRoot: string;
  readonly output: OutputMode;
}

function executionMode(): 'npx' | 'bun' | 'node' {
  if (process.env.npm_execpath) return 'npx';
  return process.versions.bun ? 'bun' : 'node';
}

export async function versionCommand(options: VersionOptions): Promise<{ code: number; data: unknown }> {
  const [state, skills, config, updates, latest] = await Promise.all([
    readInstallationState(options.projectRoot),
    loadSkillsLock(options.projectRoot),
    loadConfig(options.projectRoot),
    checkUpdates(options.projectRoot, false),
    getLatestCliVersion(packageJson.name),
  ]);
  const data = {
    success: true,
    command: 'version',
    cli: { version: packageJson.version, execution: executionMode() },
    project: {
      initialized: config.success,
      harness: state?.harnessVersion ?? null,
      schemaVersion: state?.schemaVersion ?? null,
    },
    targets: state?.targets ?? {},
    skills: {
      installed: Object.keys(skills ?? {}).length,
      outdated: updates.skills.filter((skill) => skill.hasUpdate).length,
    },
    latest: { codeconductor: latest },
  };
  const output = [
    'CodeConductor',
    '',
    'CLI',
    `  version          ${data.cli.version}`,
    `  execution        ${data.cli.execution}`,
    '',
    'Project',
    `  initialized      ${data.project.initialized ? 'yes' : 'no'}`,
    `  harness          ${data.project.harness ?? 'not installed'}`,
    `  config schema    ${data.project.schemaVersion ?? '-'}`,
    '',
    'Targets',
    ...Object.entries(data.targets).map(([target, value]) => `  ${target}           ${value.version}`),
    ...(Object.keys(data.targets).length === 0 ? ['  none'] : []),
    '',
    'Skills',
    `  installed        ${data.skills.installed}`,
    `  outdated         ${data.skills.outdated}`,
    '',
    'Latest available',
    `  CodeConductor    ${data.latest.codeconductor ?? 'unavailable'}`,
  ].join('\n');
  return { code: 0, data: { ...data, output } };
}
