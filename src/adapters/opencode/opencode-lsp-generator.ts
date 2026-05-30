import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLspCommand } from '../../core/lsp/lsp-config-utils';
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

    const mcp: Record<
      string,
      { type: 'local'; command: string[]; enabled: boolean; timeout: number }
    > = {};

    for (const lsp of successfulLsps) {
      const config = getLspCommand(lsp.lspId);
      if (config) {
        mcp[lsp.lspId] = {
          type: 'local',
          command: [config.command, ...config.args],
          enabled: true,
          timeout: 120000,
        };
      }
    }

    const content = JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        mcp,
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
