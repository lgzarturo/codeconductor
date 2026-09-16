import packageJson from '../../package.json';
import { loadConfig } from '../core/config/config-loader';
import { detectProject } from '../core/detection/project-detector';
import { readInstallationState } from '../core/install/installation-state';
import { resolvePreset } from '../core/presets/preset-resolver';

export async function onboardingCommand(projectRoot: string): Promise<{ code: number; data: unknown }> {
  const [config, profile, state] = await Promise.all([
    loadConfig(projectRoot),
    detectProject(projectRoot),
    readInstallationState(projectRoot),
  ]);

  if (!config.success) {
    const recommendation = resolvePreset('opencode', profile);
    return {
      code: 0,
      data: {
        success: true,
        command: 'onboarding',
        initialized: false,
        detected: profile,
        recommendedPreset: recommendation.stack,
        output: [
          `CodeConductor ${packageJson.version}`,
          'Structured agentic development harness.',
          '',
          'CodeConductor is not initialized in this project.',
          '',
          'Get started:',
          '  1. Inspect what will be installed',
          '     cc setup --dry-run',
          '  2. Configure the harness',
          '     cc setup',
          '  3. Verify the installation',
          '     cc doctor',
          '',
          `Detected project: ${[...profile.runtimes, ...profile.frameworks].join(', ') || 'unknown'}`,
          `Recommended preset: ${recommendation.stack}`,
          '',
          'Documentation:',
          '  cc help setup',
          '  cc docs getting-started',
        ].join('\n'),
      },
    };
  }

  const target = config.data.defaults.target;
  return {
    code: 0,
    data: {
      success: true,
      command: 'onboarding',
      initialized: true,
      output: [
        `CodeConductor ${packageJson.version}`,
        '',
        'Project harness',
        '  installed       yes',
        `  version         ${state?.harnessVersion ?? 'unknown (legacy installation)'}`,
        `  target          ${target}`,
        `  locale          ${config.data.defaults.locale}`,
        '',
        'Run:',
        '  cc status',
        '  cc doctor',
        '  cc update --check',
        '',
        'Other commands:',
        '  cc help',
      ].join('\n'),
    },
  };
}
