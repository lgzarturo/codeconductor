import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import { createAgyInstaller } from '../adapters/agy/agy-installer';
import { createClaudeInstaller } from '../adapters/claude/claude-installer';
import { createCodexInstaller } from '../adapters/codex/codex-installer';
import { createCursorInstaller } from '../adapters/cursor/cursor-installer';
import { createGeminiInstaller } from '../adapters/gemini/gemini-installer';
import { createOpenCodeInstaller } from '../adapters/opencode/opencode-installer';
import { createPiInstaller } from '../adapters/pi/pi-installer';
import { loadConfig } from '../core/config/config-loader';
import { detectProject } from '../core/detection/project-detector';
import { writeGeneratedFiles, type WriteOptions } from '../core/filesystem/file-writer';
import { copyFromManifest, type FileCopyResult } from '../core/presets/file-copier';
import { loadManifest, loadModelConfig, PRESETS_DIR } from '../core/presets/manifest-loader';
import { loadCouncilPreset } from '../core/presets/preset-loader';
import { resolvePreset, type PresetResolution } from '../core/presets/preset-resolver';
import {
  getIndividualTargets,
  parseRunnerTarget,
  type IndividualRunnerTarget,
} from '../core/runner/runner-target';
import { parseSkillFrontmatter, skillIdentifier } from '../core/presets/skill-frontmatter';
import { recordManagedFiles } from '../core/install/installation-state';
import type { InstallManifest } from '../validation/schemas';
import type { OutputMode } from '../utils/logger';
import packageJson from '../../package.json';

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

    // Load config for credential pattern resolution
    const configResult = await loadConfig(projectRoot);
    const config = configResult.success ? configResult.data : undefined;

    const spec = presetResult.data;
    const writeOptions: WriteOptions = { dryRun, force, config };
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
        case 'gemini':
          installer = createGeminiInstaller(spec);
          break;
        case 'agy':
          installer = createAgyInstaller(spec);
          break;
        case 'cursor':
          installer = createCursorInstaller(spec);
          break;
        case 'pi':
          installer = createPiInstaller(spec);
          break;
        default:
          continue;
      }

      const generatedFiles = await installer.generate();

      // agy (Antigravity CLI) is the one target whose global config lives
      // under a nested provider path instead of directly at $HOME — its
      // generated paths are prefixed with `.agents/` and need that prefix
      // stripped once redirected there. Every other target's generated
      // paths are already native to that target (`.gemini/...`,
      // `.cursor/...`) and resolve correctly straight under $HOME.
      const isAgyGlobal = t === 'agy' && isGlobal;
      const targetBase = isAgyGlobal ? resolve(homedir(), '.gemini', 'config') : baseDir;

      // Anchor relative paths to baseDir
      const resolvedFiles = generatedFiles.map((f) => ({
        ...f,
        path: resolve(targetBase, isAgyGlobal ? f.path.replace(/^\.agents\/?/, '') : f.path),
      }));

      const results = await writeGeneratedFiles(resolvedFiles, {
        ...writeOptions,
        projectRoot: targetBase,
      });

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

    if (!dryRun) {
      for (const targetName of targets) {
        await recordManagedFiles(
          baseDir,
          successes.filter((file) => file.target === targetName).map((file) => file.path),
          { cliVersion: packageJson.version, target: targetName },
        );
      }
    }

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
 * Re-read every successfully written template file and check for a leaked
 * `{{PLACEHOLDER}}` renderTemplate should have substituted, plus — for
 * SKILL.md files — that the rendered frontmatter still validates. Scoped to
 * `template: true` entries only: non-template files are copied verbatim, and
 * their correctness is already covered at the source by the
 * frontmatter-parity test, so re-checking a byte-identical copy here would
 * be redundant.
 */
export async function verifyRenderedFiles(
  manifest: InstallManifest,
  baseDir: string,
  results: FileCopyResult[]
): Promise<string[]> {
  const templatePrefixes = manifest.entries
    .filter((e) => e.template === true)
    .map((e) => resolve(baseDir, e.dest));

  const warnings: string[] = [];
  for (const r of results) {
    if (r.dryRun || r.action === 'skipped' || r.action === 'error') continue;
    const isTemplateFile = templatePrefixes.some((p) => r.dest === p || r.dest.startsWith(p + sep));
    if (!isTemplateFile) continue;

    let content: string;
    try {
      content = await readFile(r.dest, 'utf-8');
    } catch {
      continue;
    }

    const leaked = [...new Set(content.match(/\{\{[A-Z_]+\}\}/g) ?? [])];
    if (leaked.length > 0) {
      warnings.push(`${r.dest}: unresolved placeholder(s) ${leaked.join(', ')}`);
    }

    if (basename(r.dest) === 'SKILL.md') {
      const parsed = parseSkillFrontmatter(content);
      if (!parsed.ok) {
        warnings.push(`${r.dest}: ${parsed.error.kind} — ${parsed.error.message}`);
      } else {
        const dir = basename(dirname(r.dest));
        const ident = skillIdentifier(parsed.frontmatter);
        if (ident !== dir) {
          warnings.push(`${r.dest}: identifier "${ident}" does not match its directory "${dir}"`);
        }
      }
    }
  }
  return warnings;
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
    const postInstallWarnings: string[] = [];

    for (const t of targets) {
      const manifest = await loadManifest(t as IndividualRunnerTarget);
      const modelConfig = await loadModelConfig(t as IndividualRunnerTarget);
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

      if (!dryRun) {
        postInstallWarnings.push(...(await verifyRenderedFiles(manifest, baseDir, results)));
      }
    }

    const errors = allFileResults.filter((r) => r.action === 'error');

    if (!dryRun && errors.length === 0) {
      for (const targetName of targets) {
        await recordManagedFiles(
          baseDir,
          allFileResults
            .filter((file) => file.target === targetName && ['written', 'appended', 'merged'].includes(file.action))
            .map((file) => file.dest),
          { cliVersion: packageJson.version, target: targetName },
        );
      }
    }

    return {
      code: errors.length > 0 ? 2 : 0,
      data: {
        success: errors.length === 0,
        command: 'install',
        subcommand: 'preset',
        targets,
        global: isGlobal,
        dryRun,
        postInstallWarnings,
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
