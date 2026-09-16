import { loadConfig } from '../core/config/config-loader';
import { getManagedFileStatus, readInstallationState } from '../core/install/installation-state';
import { checkUpdates, isTargetInstalled } from '../core/presets/update-checker';
import { INDIVIDUAL_TARGETS } from '../core/runner/runner-target';
import { resolve } from 'node:path';
import type { OutputMode } from '../utils/logger';

export interface StatusOptions {
  readonly projectRoot: string;
  readonly output: OutputMode;
}

export async function statusCommand(options: StatusOptions): Promise<{ code: number; data: unknown }> {
  const [configResult, state] = await Promise.all([
    loadConfig(options.projectRoot),
    readInstallationState(options.projectRoot),
  ]);
  const targets = await Promise.all(INDIVIDUAL_TARGETS.map(async (target) => ({
    target,
    installed: await isTargetInstalled(target, options.projectRoot, false),
    version: state?.targets[target]?.version ?? null,
  })));
  const updates = configResult.success ? await checkUpdates(options.projectRoot, false) : null;
  const modifiedFiles = state
    ? (await Promise.all(Object.keys(state.managedFiles).map(async (file) =>
      (await getManagedFileStatus(options.projectRoot, resolve(options.projectRoot, file), state)) === 'modified' ? file : null,
    ))).filter((file): file is string => file !== null)
    : [];
  const data = {
    success: true,
    command: 'status',
    initialized: configResult.success,
    harness: state?.harnessVersion ?? null,
    configuration: configResult.success ? {
      locale: configResult.data.defaults.locale,
      target: configResult.data.defaults.target,
      council: configResult.data.presets.council.enabled,
    } : null,
    targets,
    updates: updates ? { available: updates.hasUpdates, conflicts: updates.conflicts } : null,
    modifiedFiles,
  };
  const output = [
    `Project: ${configResult.success ? configResult.data.project.name : 'not initialized'}`,
    `Harness: ${data.harness ?? 'not installed'}`,
    '',
    'Targets',
    ...targets.map((target) => `  ${target.target.padEnd(12)} ${target.installed ? `installed${target.version ? ` (${target.version})` : ''}` : '-'}`),
    '',
    'Configuration',
    `  locale       ${data.configuration?.locale ?? '-'}`,
    `  target       ${data.configuration?.target ?? '-'}`,
    `  council      ${data.configuration?.council === undefined ? '-' : data.configuration.council ? 'enabled' : 'disabled'}`,
    '',
    'Updates',
    `  ${data.updates?.available ? 'updates available' : 'Harness is current'}`,
    ...(modifiedFiles.length ? [`  locally modified managed files: ${modifiedFiles.length}`] : []),
    ...(data.updates?.conflicts.length ? [`  conflicts: ${data.updates.conflicts.join(', ')}`] : []),
    '',
    'Run `cc doctor` for diagnostics.',
  ].join('\n');
  return { code: 0, data: { ...data, output } };
}
