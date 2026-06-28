import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createAgyInstaller } from '../adapters/agy/agy-installer';
import { createClaudeInstaller } from '../adapters/claude/claude-installer';
import { createCodexInstaller } from '../adapters/codex/codex-installer';
import { createOpenCodeInstaller } from '../adapters/opencode/opencode-installer';
import { loadConfig } from '../core/config/config-loader';
import { detectProject } from '../core/detection/project-detector';
import { writeGeneratedFiles, type WriteOptions } from '../core/filesystem/file-writer';
import { copyFromManifest } from '../core/presets/file-copier';
import { loadManifest, loadModelConfig, PRESETS_DIR } from '../core/presets/manifest-loader';
import { loadCouncilPreset } from '../core/presets/preset-loader';
import { resolvePreset, type PresetResolution } from '../core/presets/preset-resolver';
import { getIndividualTargets, parseRunnerTarget } from '../core/runner/runner-target';
import type { OutputMode } from '../utils/logger';

export interface InstallOptions {
  readonly target: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly global: boolean;
  readonly output: OutputMode;
  readonly projectRoot: string;
}

export interface InstallPresetOptions {
  readonly target: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly global: boolean;
  readonly output: OutputMode;
  readonly projectRoot: string;
  /** Locale override. If omitted, read from .codeconductor/config.yml (default 'en'). */
  readonly locale?: 'en' | 'es';
}

/**
 * Install preset to runner targets.
 * With --global, writes to ~/.<target>/ instead of ./.<target>/
 */
export async function installCommand(
  options: InstallOptions
): Promise<{ code: number; data?: unknown }> {
  const { target, dryRun, force, global: isGlobal, output, projectRoot } = options;

  const baseDir = isGlobal ? homedir() : projectRoot;

  try {
    const runnerTarget = parseRunnerTarget(target);
    const targets = getIndividualTargets(runnerTarget);

    const presetResult = await loadCouncilPreset(projectRoot);
    if (!presetResult.success) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'install',
          errors: [presetResult.error.message],
        },
      };
    }

    const spec = presetResult.data;
    const writeOptions: WriteOptions = { dryRun, force };
    const allFiles: { target: string; path: string; success: boolean; error?: string }[] = [];

    for (const t of targets) {
      let installer;
      switch (t) {
        case 'opencode':
          installer = createOpenCodeInstaller(spec);
          break;
        case 'claude':
          installer = createClaudeInstaller(spec);
          break;
        case 'codex':
          installer = createCodexInstaller(spec);
          break;
        case 'agy':
          installer = createAgyInstaller(spec);
          break;
        default:
          continue;
      }

      const generatedFiles = await installer.generate();

      // Anchor relative paths to baseDir
      const resolvedFiles = generatedFiles.map((f) => {
        let targetPath = f.path;
        let targetBase = baseDir;

        if (t === 'agy' && isGlobal) {
          targetBase = resolve(homedir(), '.gemini', 'config');
          targetPath = targetPath.replace(/^\.agents\/?/, '');
        }

        return {
          ...f,
          path: resolve(targetBase, targetPath),
        };
      });

      const results = await writeGeneratedFiles(resolvedFiles, writeOptions);

      for (const result of results) {
        allFiles.push({
          target: t,
          path: result.path,
          success: result.success,
          error: result.error,
        });
      }
    }

    const errors = allFiles.filter((f) => !f.success).map((f) => `${f.path}: ${f.error}`);
    const successes = allFiles.filter((f) => f.success);

    if (errors.length > 0 && successes.length === 0) {
      return {
        code: 2,
        data: {
          success: false,
          command: 'install',
          errors,
        },
      };
    }

    if (errors.length > 0) {
      return {
        code: 2,
        data: {
          success: true,
          command: 'install',
          targets,
          written: successes.map((s) => s.path),
          errors,
        },
      };
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'install',
        targets,
        global: isGlobal,
        written: successes.map((s) => s.path),
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'install',
        errors: [String(error)],
      },
    };
  }
}

/**
 * Install full preset files via YAML manifests.
 * Supports overwrite / append / merge-json / skip strategies per entry.
 */
export async function installPresetCommand(
  options: InstallPresetOptions
): Promise<{ code: number; data?: unknown }> {
  const { target, dryRun, force, global: isGlobal, projectRoot } = options;
  const baseDir = isGlobal ? homedir() : projectRoot;

  try {
    const runnerTarget = parseRunnerTarget(target);
    const targets = getIndividualTargets(runnerTarget);
    const profile = await detectProject(projectRoot);
    const presetResolution: PresetResolution[] = targets.map((t) =>
      resolvePreset(t as PresetResolution['target'], profile)
    );

    // Resolve locale: CLI override → config.yml → default 'en'
    let locale: 'en' | 'es' = options.locale ?? 'en';
    if (!options.locale) {
      const configResult = await loadConfig(projectRoot);
      if (configResult.success) {
        locale = (configResult.data.defaults.locale ?? 'en') as 'en' | 'es';
      }
    }

    const allFileResults: Array<{
      target: string;
      src: string;
      dest: string;
      action: string;
      dryRun?: boolean;
      error?: string;
    }> = [];

    for (const t of targets) {
      const manifest = await loadManifest(
        t as 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy'
      );
      const modelConfig = await loadModelConfig(
        t as 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy'
      );
      const results = await copyFromManifest(
        manifest,
        PRESETS_DIR,
        baseDir,
        isGlobal,
        dryRun,
        force,
        modelConfig,
        locale
      );
      for (const r of results) {
        allFileResults.push({ target: t, ...r });
      }
    }

    const errors = allFileResults.filter((r) => r.action === 'error');

    return {
      code: errors.length > 0 ? 2 : 0,
      data: {
        success: errors.length === 0,
        command: 'install',
        subcommand: 'preset',
        targets,
        global: isGlobal,
        dryRun,
        locale,
        presetResolution,
        fileResults: allFileResults,
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'install',
        errors: [String(error)],
      },
    };
  }
}
