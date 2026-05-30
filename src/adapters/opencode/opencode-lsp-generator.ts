import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLanguageServerConfig } from '../../core/lsp/lsp-config-utils';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

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

    const content = JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        languageServers,
      },
      null,
      2
    );

    return [
      {
        path: '.opencode/opencode.json',
        content,
        overwrite: false,
      },
    ];
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
