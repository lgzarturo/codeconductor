import packageJson from '../../package.json';
import { loadConfig } from '../core/config/config-loader';
import { detectProject } from '../core/detection/project-detector';
import { readInstallationState } from '../core/install/installation-state';
import { resolvePreset } from '../core/presets/preset-resolver';
import { resolveCliBin } from '../utils/cli-bin';

export async function onboardingCommand(projectRoot: string): Promise<{ code: number; data: unknown }> {
  const bin = resolveCliBin();
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
          `     ${bin} setup --dry-run`,
          '  2. Configure the harness',
          `     ${bin} setup`,
          '  3. Verify the installation',
          `     ${bin} doctor`,
          '',
          `Detected project: ${[...profile.runtimes, ...profile.frameworks].join(', ') || 'unknown'}`,
          `Recommended preset: ${recommendation.stack}`,
          '',
          'Documentation:',
          `  ${bin} help setup`,
          `  ${bin} docs getting-started`,
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
        `  ${bin} status`,
        `  ${bin} doctor`,
        `  ${bin} update --check`,
        '',
        'Other commands:',
        `  ${bin} help`,
      ].join('\n'),
    },
  };
}
