import { doctorCommand } from './doctor.command';
import { initCommand } from './init.command';
import { installPresetCommand } from './install.command';
import type { OutputMode } from '../utils/logger';

export interface SetupOptions {
  readonly projectRoot: string;
  readonly target: string;
  readonly locale: 'en' | 'es';
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly yes: boolean;
  readonly output: OutputMode;
}

/** A deliberately thin onboarding layer over the existing low-level commands. */
export async function setupCommand(options: SetupOptions): Promise<{ code: number; data: unknown }> {
  const init = await initCommand({
    projectRoot: options.projectRoot,
    dryRun: options.dryRun,
    force: options.force,
    global: false,
    output: options.output,
    locale: options.locale,
  });
  if (init.code !== 0) return init as { code: number; data: unknown };

  const install = await installPresetCommand({
    projectRoot: options.projectRoot,
    target: options.target,
    dryRun: options.dryRun,
    force: options.force,
    global: false,
    output: options.output,
    locale: options.locale,
  });
  if (install.code !== 0) return install as { code: number; data: unknown };

  if (options.dryRun) {
    return {
      code: 0,
      data: {
        success: true,
        command: 'setup',
        dryRun: true,
        target: options.target,
        locale: options.locale,
        steps: ['detect', 'init', 'install preset'],
        message: 'Dry run - no files modified',
      },
    };
  }
  const doctor = await doctorCommand({ projectRoot: options.projectRoot, output: options.output });
  return {
    code: doctor.code,
    data: {
      success: doctor.code === 0,
      command: 'setup',
      target: options.target,
      locale: options.locale,
      initialized: init.data,
      installed: install.data,
      doctor: doctor.data,
      message: doctor.code === 0 ? 'Setup complete' : 'Setup completed with diagnostic failures',
    },
  };
}
