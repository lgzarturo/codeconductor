import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLanguageServerConfig } from '../../core/lsp/lsp-config-utils';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

/**
 * Cursor LSP config generator
 */
export class CursorLspGenerator implements LspConfigGenerator {
  readonly name = 'cursor-lsp';
  readonly target: RunnerTarget = 'cursor';

  generate(installedLsps: readonly LspInstallResult[]): readonly GeneratedFile[] {
    const successfulLsps = installedLsps.filter((lsp) => lsp.status !== 'failed');
    if (successfulLsps.length === 0) {
      return [];
    }

    const languageServers = getLanguageServerConfig(successfulLsps.map((lsp) => lsp.lspId));

    const content = JSON.stringify(
      {
        languageServers,
      },
      null,
      2
    );

    return [
      {
        path: '.cursor/settings.json',
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
 * Create Cursor LSP generator
 */
export function createCursorLspGenerator(): LspConfigGenerator {
  return new CursorLspGenerator();
}
