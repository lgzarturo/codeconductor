import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createAgyLspGenerator } from '../adapters/agy/agy-lsp-generator';
import { createClaudeLspGenerator } from '../adapters/claude/claude-lsp-generator';
import { createCodexLspGenerator } from '../adapters/codex/codex-lsp-generator';
import { createCursorLspGenerator } from '../adapters/cursor/cursor-lsp-generator';
import { createGeminiLspGenerator } from '../adapters/gemini/gemini-lsp-generator';
import { createOpenCodeLspGenerator } from '../adapters/opencode/opencode-lsp-generator';
import { detectProject } from '../core/detection/project-detector';
import { writeGeneratedFiles, type WriteOptions } from '../core/filesystem/file-writer';
import type { LspConfigGenerator } from '../core/lsp/lsp-config-generator';
import { createLspInstaller } from '../core/lsp/lsp-installer';
import { resolveLsps } from '../core/lsp/lsp-registry';
import { getIndividualTargets, parseRunnerTarget, type RunnerTarget } from '../core/runner/runner-target';
import type { LspInstallResult } from '../domain/lsp/lsp-definition';
import type { OutputMode } from '../utils/logger';

export interface InstallLspOptions {
  readonly target: string;
  readonly lang?: readonly string[];
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly global: boolean;
  readonly output: OutputMode;
  readonly projectRoot: string;
}

interface ConfigResult {
  readonly target: string;
  readonly path: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Install LSP command
 */
export async function installLspCommand(
  options: InstallLspOptions
): Promise<{ code: number; data?: unknown }> {
  const { target, lang, dryRun, force, global: isGlobal, output, projectRoot } = options;
  const baseDir = isGlobal ? homedir() : projectRoot;

  try {
    const runnerTarget = parseRunnerTarget(target);
    const targets = getIndividualTargets(runnerTarget);

    // Detect languages or use provided --lang
    let languages: readonly string[];
    if (lang && lang.length > 0) {
      languages = lang;
    } else {
      const profile = await detectProject(projectRoot);
      languages = profile.languages;
    }

    if (languages.length === 0) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'install',
          subcommand: 'lsp',
          errors: ['No languages detected. Use --lang to specify languages manually.'],
        },
      };
    }

    // Resolve LSPs for detected languages
    const lsps = resolveLsps(languages);
    if (lsps.length === 0) {
      return {
        code: 1,
        data: {
          success: false,
          command: 'install',
          subcommand: 'lsp',
          errors: [`No LSP servers available for languages: ${languages.join(', ')}`],
        },
      };
    }

    // Install LSPs
    const installer = createLspInstaller();
    const installReport = await installer.installAll(lsps, { dryRun });

    // Generate config for each target
    const writeOptions: WriteOptions = { dryRun, force };
    const allConfigResults: ConfigResult[] = [];

    for (const t of targets) {
      const generator = getLspConfigGenerator(t);
      if (!generator) {
        continue;
      }

      const generatedFiles = generator.generate(installReport.results);

      // Anchor relative paths to baseDir
      const resolvedFiles = generatedFiles.map((f) => ({
        ...f,
        path: resolve(baseDir, f.path),
      }));

      const results = await writeGeneratedFiles(resolvedFiles, writeOptions);

      for (const result of results) {
        allConfigResults.push({
          target: t,
          path: result.path,
          success: result.success,
          error: result.error,
        });
      }
    }

    const errors = allConfigResults.filter((r) => !r.success).map((r) => `${r.path}: ${r.error}`);

    if (output === 'json') {
      return {
        code: errors.length > 0 ? 2 : 0,
        data: {
          success: errors.length === 0,
          command: 'install',
          subcommand: 'lsp',
          targets,
          languages: [...languages],
          global: isGlobal,
          dryRun,
          lspResults: installReport.results,
          configResults: allConfigResults,
        },
      };
    }

    // Human-readable output
    console.log('\nLSP Installation:');
    for (const result of installReport.results) {
      const icon = result.status === 'already-installed' ? '✓' : result.status === 'installed' ? '+' : '✗';
      const version = result.version ? ` (${result.version})` : '';
      const error = result.error ? `: ${result.error}` : '';
      console.log(`  ${icon} ${result.lspId}${version}${error}`);
    }

    console.log('\nConfig Files:');
    for (const result of allConfigResults) {
      const icon = result.success ? '✓' : '✗';
      const error = result.error ? `: ${result.error}` : '';
      console.log(`  ${icon} ${result.target}: ${result.path}${error}`);
    }

    const note = dryRun ? ' (dry-run)' : '';
    console.log(`\n${installReport.results.length} LSPs processed, ${allConfigResults.length} config files${note}`);

    return {
      code: errors.length > 0 ? 2 : 0,
      data: {
        success: errors.length === 0,
        command: 'install',
        subcommand: 'lsp',
        targets,
        languages: [...languages],
        global: isGlobal,
        dryRun,
        lspResults: installReport.results,
        configResults: allConfigResults,
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'install',
        subcommand: 'lsp',
        errors: [String(error)],
      },
    };
  }
}

function getLspConfigGenerator(target: RunnerTarget): LspConfigGenerator | undefined {
  switch (target) {
    case 'opencode':
      return createOpenCodeLspGenerator();
    case 'claude':
      return createClaudeLspGenerator();
    case 'codex':
      return createCodexLspGenerator();
    case 'gemini':
      return createGeminiLspGenerator();
    case 'cursor':
      return createCursorLspGenerator();
    case 'agy':
      return createAgyLspGenerator();
    default:
      return undefined;
  }
}
