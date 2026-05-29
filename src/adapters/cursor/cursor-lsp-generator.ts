import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLspCommand } from '../../core/lsp/lsp-config-utils';
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

    const mcpServers: Record<string, { command: string; args: string[] }> = {};

    for (const lsp of successfulLsps) {
      const config = getLspCommand(lsp.lspId);
      if (config) {
        mcpServers[lsp.lspId] = { command: config.command, args: [...config.args] };
      }
    }

    const content = JSON.stringify(
      {
        mcpServers,
      },
      null,
      2
    );

    return [
      {
        path: '.cursor/mcp.json',
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
