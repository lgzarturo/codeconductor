import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLanguageServerConfig } from '../../core/lsp/lsp-config-utils';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

/**
 * Gemini LSP config generator
 */
export class GeminiLspGenerator implements LspConfigGenerator {
  readonly name = 'gemini-lsp';
  readonly target: RunnerTarget = 'gemini';

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
        path: '.gemini/settings.json',
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
 * Create Gemini LSP generator
 */
export function createGeminiLspGenerator(): LspConfigGenerator {
  return new GeminiLspGenerator();
}
