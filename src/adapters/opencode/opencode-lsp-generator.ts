import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLanguageServerConfig } from '../../core/lsp/lsp-config-utils';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

type OpenCodeLanguageServerConfig = Record<
  string,
  { readonly command: readonly string[]; readonly extensions: readonly string[] }
>;

const OPENCODE_LSP_EXTENSIONS: Record<string, readonly string[]> = {
  typescript: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
  php: ['.php'],
  python: ['.py', '.pyi'],
  kotlin: ['.kt', '.kts'],
};

/**
 * OpenCode LSP config generator
 */
export class OpenCodeLspGenerator implements LspConfigGenerator {
  readonly name = 'opencode-lsp';
  readonly target: RunnerTarget = 'opencode';

  generate(installedLsps: readonly LspInstallResult[]): readonly GeneratedFile[] {
    const successfulLsps = installedLsps.filter((lsp) => lsp.status !== 'failed');
    if (successfulLsps.length === 0) {
      return [];
    }

    const languageServers = getLanguageServerConfig(successfulLsps.map((lsp) => lsp.lspId));
    const lsp = this.toOpenCodeLspConfig(languageServers);

    const content = JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        lsp,
      },
      null,
      2
    );

    return [
      {
        path: '.opencode/opencode.json',
        content: `${content}\n`,
        overwrite: false,
      },
    ];
  }

  private toOpenCodeLspConfig(
    languageServers: ReturnType<typeof getLanguageServerConfig>
  ): OpenCodeLanguageServerConfig {
    return Object.fromEntries(
      Object.entries(languageServers).map(([name, config]) => [
        name,
        {
          command: [config.command, ...config.args],
          extensions: OPENCODE_LSP_EXTENSIONS[name] ?? [],
        },
      ])
    );
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Create OpenCode LSP generator
 */
export function createOpenCodeLspGenerator(): LspConfigGenerator {
  return new OpenCodeLspGenerator();
}
