import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLspCommand } from '../../core/lsp/lsp-config-utils';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

/**
 * Claude LSP config generator
 */
export class ClaudeLspGenerator implements LspConfigGenerator {
  readonly name = 'claude-lsp';
  readonly target: RunnerTarget = 'claude';

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
        path: '.claude/settings.json',
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
 * Create Claude LSP generator
 */
export function createClaudeLspGenerator(): LspConfigGenerator {
  return new ClaudeLspGenerator();
}
