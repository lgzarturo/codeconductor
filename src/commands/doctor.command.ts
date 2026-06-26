import { join } from 'node:path';
import { homedir } from 'node:os';
import { configExists, loadConfig } from '../core/config/config-loader';
import { loadTargetSecurityCompatibility } from '../core/security/target-compatibility';
import { checkUpdates, validateAgentFileSizes, validateAgentMarkers } from '../core/presets/update-checker';
import type { OutputMode } from '../utils/logger';

export interface DoctorOptions {
  readonly output: OutputMode;
  readonly projectRoot: string;
}

/**
 * Validate configuration and generated files
 */
export async function doctorCommand(
  options: DoctorOptions
): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output } = options;

  const checks: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

  try {
    // Check 1: Config exists
    const hasConfig = await configExists(projectRoot);
    if (hasConfig) {
      checks.push({
        name: 'config-exists',
        status: 'pass',
        message: '.codeconductor/config.yml exists',
      });
    } else {
      checks.push({
        name: 'config-exists',
        status: 'fail',
        message: '.codeconductor/config.yml not found. Run `codeconductor init` first.',
      });
      return {
        code: 4,
        data: {
          success: false,
          command: 'doctor',
          checks,
        },
      };
    }

    // Check 2: Config is valid
    const configResult = await loadConfig(projectRoot);
    if (configResult.success) {
      checks.push({
        name: 'config-valid',
        status: 'pass',
        message: 'Config is valid',
      });
    } else {
      checks.push({
        name: 'config-valid',
        status: 'fail',
        message: `Config validation failed: ${configResult.error.message}`,
      });
      return {
        code: 1,
        data: {
          success: false,
          command: 'doctor',
          checks,
        },
      };
    }

    // Check 3: Runner directories
    const runnerDirs = ['.opencode', '.claude', '.codex'];
    for (const dir of runnerDirs) {
      try {
        const { access } = await import('node:fs/promises');
        await access(join(projectRoot, dir));
        checks.push({
          name: `dir-${dir}`,
          status: 'pass',
          message: `${dir}/ exists`,
        });
      } catch {
        checks.push({
          name: `dir-${dir}`,
          status: 'warn',
          message: `${dir}/ not found (optional)`,
        });
      }
    }

    // Check 4: Preset version
    const config = configResult.data;
    if (config.presets.council.enabled) {
      checks.push({
        name: 'council-enabled',
        status: 'pass',
        message: `Council preset enabled (v${config.presets.council.version})`,
      });
    }

    // Check updates availability
    const localUpdates = await checkUpdates(projectRoot, false);
    const globalUpdates = await checkUpdates(homedir(), true);

    const updateDetails: string[] = [];
    if (localUpdates.hasUpdates) {
      if (localUpdates.council) updateDetails.push('local council preset');
      if (localUpdates.policy) updateDetails.push('local policy');
      const updatedLocalTargets = localUpdates.targets.filter(t => t.hasUpdate).map(t => t.target);
      if (updatedLocalTargets.length > 0) {
        updateDetails.push(`local targets (${updatedLocalTargets.join(', ')})`);
      }
      const updatedLocalSkills = localUpdates.skills.filter(s => s.hasUpdate).map(s => s.id);
      if (updatedLocalSkills.length > 0) {
        updateDetails.push(`local skills (${updatedLocalSkills.join(', ')})`);
      }
    }
    if (globalUpdates.hasUpdates) {
      if (globalUpdates.council) updateDetails.push('global council preset');
      if (globalUpdates.policy) updateDetails.push('global policy');
      const updatedGlobalTargets = globalUpdates.targets.filter(t => t.hasUpdate).map(t => t.target);
      if (updatedGlobalTargets.length > 0) {
        updateDetails.push(`global targets (${updatedGlobalTargets.join(', ')})`);
      }
      const updatedGlobalSkills = globalUpdates.skills.filter(s => s.hasUpdate).map(s => s.id);
      if (updatedGlobalSkills.length > 0) {
        updateDetails.push(`global skills (${updatedGlobalSkills.join(', ')})`);
      }
    }

    if (updateDetails.length > 0) {
      checks.push({
        name: 'updates-available',
        status: 'warn',
        message: `Updates available for: ${updateDetails.join(', ')}`,
      });
    } else {
      checks.push({
        name: 'updates-available',
        status: 'pass',
        message: 'All presets, targets, and skills are up to date',
      });
    }

    // Check agent file sizes
    const largeFilesLocal = await validateAgentFileSizes(projectRoot, false);
    const largeFilesGlobal = await validateAgentFileSizes(homedir(), true);
    const allLargeFiles = [...largeFilesLocal, ...largeFilesGlobal];

    if (allLargeFiles.length > 0) {
      checks.push({
        name: 'agent-file-sizes',
        status: 'warn',
        message: `The following files exceed 40KB: ${allLargeFiles.map((f) => f.path).join(', ')}`,
      });
    } else {
      checks.push({
        name: 'agent-file-sizes',
        status: 'pass',
        message: 'All agent files (AGENTS.md/CLAUDE.md) are under 40KB',
      });
    }

    // Check agent file markers
    const missingMarkersLocal = await validateAgentMarkers(projectRoot, false);
    const missingMarkersGlobal = await validateAgentMarkers(homedir(), true);
    const allMissingMarkers = [...missingMarkersLocal, ...missingMarkersGlobal];

    if (allMissingMarkers.length > 0) {
      checks.push({
        name: 'agent-file-markers',
        status: 'warn',
        message: `The following files have missing or invalid managed markers: ${allMissingMarkers.map((f) => `${f.path} (${f.error})`).join(', ')}`,
      });
    } else {
      checks.push({
        name: 'agent-file-markers',
        status: 'pass',
        message: 'All agent files have valid managed markers',
      });
    }

    // Check 5: Target security compatibility
    const securityCompatibility = await loadTargetSecurityCompatibility();
    for (const compatibility of securityCompatibility) {
      checks.push({
        name: `security-${compatibility.target}`,
        status: compatibility.status,
        message:
          compatibility.status === 'pass'
            ? `${compatibility.target} can represent the canonical policy model`
            : `${compatibility.target} cannot enforce: ${compatibility.unsupportedRules.join(', ') || 'see warnings'}`,
      });
    }

    // All checks passed
    const failedCount = checks.filter((c) => c.status === 'fail').length;
    if (failedCount > 0) {
      return {
        code: 4,
        data: {
          success: false,
          command: 'doctor',
          checks,
        },
      };
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'doctor',
        checks,
        securityCompatibility,
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'doctor',
        errors: [String(error)],
      },
    };
  }
}
