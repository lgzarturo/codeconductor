import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLspCommand } from '../../core/lsp/lsp-config-utils';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

/**
 * Codex LSP config generator
 */
export class CodexLspGenerator implements LspConfigGenerator {
  readonly name = 'codex-lsp';
  readonly target: RunnerTarget = 'codex';

  generate(installedLsps: readonly LspInstallResult[]): readonly GeneratedFile[] {
    const successfulLsps = installedLsps.filter((lsp) => lsp.status !== 'failed');
    if (successfulLsps.length === 0) {
      return [];
    }

    const sections: string[] = ['# Codex LSP Configuration', ''];

    for (const lsp of successfulLsps) {
      const config = getLspCommand(lsp.lspId);
      if (config) {
        sections.push(`[[mcp_servers]]`);
        sections.push(`name = "${lsp.lspId}"`);
        sections.push(`command = "${config.command}"`);
        if (config.args.length > 0) {
          sections.push(`args = [${config.args.map((a) => `"${a}"`).join(', ')}]`);
        }
        sections.push('');
      }
    }

    return [
      {
        path: '.codex/config.toml',
        content: sections.join('\n'),
        overwrite: false,
      },
    ];
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Create Codex LSP generator
 */
export function createCodexLspGenerator(): LspConfigGenerator {
  return new CodexLspGenerator();
}
