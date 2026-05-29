import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { writeConfig } from '../core/config/config-writer';
import { detectProject } from '../core/detection/project-detector';
import { POLICY_PATH, SRC_PRESETS_DIR } from '../core/presets/package-paths';
import { resolvePreset } from '../core/presets/preset-resolver';
import type { OutputMode } from '../utils/logger';

export interface InitOptions {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly global: boolean;
  readonly output: OutputMode;
  readonly projectRoot: string;
}

/**
 * Initialize CodeConductor in a project or globally
 */
export async function initCommand(options: InitOptions): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, dryRun, force, global: isGlobal, output } = options;

  const baseDir = isGlobal ? homedir() : projectRoot;

  try {
    // Detect project (skip for global init)
    let profile: Awaited<ReturnType<typeof detectProject>> | null = null;
    if (!isGlobal) {
      profile = await detectProject(projectRoot);

      if (profile.signals.length === 0) {
        return {
          code: 3,
          data: {
            success: false,
            command: 'init',
            errors: ['No project signals detected. Project may be empty or unsupported.'],
          },
        };
      }
    }

    const config = profile
      ? {
          project: {
            name: basename(projectRoot) || 'unnamed-project',
            profile: profile.runtimes[0] || 'unknown',
          },
          defaults: {
            target: 'opencode' as const,
            overwrite: force,
          },
        }
      : {
          project: {
            name: 'global',
            profile: 'global',
          },
          defaults: {
            target: 'opencode' as const,
            overwrite: force,
          },
        };

    const presetResolution = profile ? resolvePreset('opencode', profile) : null;
    const wouldCreate = ['.codeconductor/config.yml'];
    const presetsToCopy = await resolvePresetsToCopy();
    for (const p of presetsToCopy) {
      wouldCreate.push(`.codeconductor/presets/${p.name}`);
    }

    if (dryRun) {
      return {
        code: 0,
        data: {
          success: true,
          command: 'init',
          message: 'Dry run - would create config',
          wouldCreate,
          ...(profile
            ? {
                detected: {
                  languages: profile.languages,
                  runtimes: profile.runtimes,
                  frameworks: profile.frameworks,
                  signals: profile.signals,
                  confidence: profile.confidence,
                },
                presetResolution,
              }
            : { global: true }),
        },
      };
    }

    const result = await writeConfig(baseDir, config, force);
    if (!result.success) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'init',
          errors: [result.error.message],
        },
      };
    }

    const copiedPresets = await copyPresets(baseDir, presetsToCopy, force);

    return {
      code: 0,
      data: {
        success: true,
        command: 'init',
        created: ['.codeconductor/config.yml', ...copiedPresets],
        ...(profile
          ? {
              detected: {
                languages: profile.languages,
                runtimes: profile.runtimes,
                frameworks: profile.frameworks,
                signals: profile.signals,
                confidence: profile.confidence,
              },
              presetResolution,
            }
          : { global: true }),
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'init',
        errors: [String(error)],
      },
    };
  }
}

interface PresetSource {
  name: string;
  sourcePath: string;
}

async function resolvePresetsToCopy(): Promise<PresetSource[]> {
  const sources: PresetSource[] = [];

  // Bundled council preset
  const bundledCouncil = resolve(SRC_PRESETS_DIR, 'council', 'council.yml');
  if (await fileExists(bundledCouncil)) {
    sources.push({ name: 'council.yml', sourcePath: bundledCouncil });
  }

  // policy.yml from package root
  const policyPath = POLICY_PATH;
  if (await fileExists(policyPath)) {
    sources.push({ name: 'policy.yml', sourcePath: policyPath });
  }

  return sources;
}

async function copyPresets(
  baseDir: string,
  presets: PresetSource[],
  force: boolean
): Promise<string[]> {
  const presetsDir = resolve(baseDir, '.codeconductor', 'presets');
  await mkdir(presetsDir, { recursive: true });

  const copied: string[] = [];
  for (const preset of presets) {
    const destPath = resolve(presetsDir, preset.name);

    if (!force && (await fileExists(destPath))) {
      continue;
    }

    try {
      const content = await readFile(preset.sourcePath, 'utf-8');
      await writeFile(destPath, content, 'utf-8');
      copied.push(`.codeconductor/presets/${preset.name}`);
    } catch (err) {
      // Non-fatal: bundled preset may not exist in installed binary
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        process.stderr.write(`warn: could not copy ${preset.name}: ${String(err)}\n`);
      }
    }
  }
  return copied;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
