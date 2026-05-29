import type { GeneratedFile } from '../../core/generation/generated-file';
import type { LspConfigGenerator } from '../../core/lsp/lsp-config-generator';
import { getLspCommand } from '../../core/lsp/lsp-config-utils';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

/**
 * Agy LSP config generator (experimental stub)
 */
export class AgyLspGenerator implements LspConfigGenerator {
  readonly name = 'agy-lsp';
  readonly target: RunnerTarget = 'agy';

  generate(installedLsps: readonly LspInstallResult[]): readonly GeneratedFile[] {
    const successfulLsps = installedLsps.filter((lsp) => lsp.status !== 'failed');
    if (successfulLsps.length === 0) {
      return [];
    }

    const sections: string[] = [
      '# Agy LSP Configuration (experimental)',
      '# NOTE: Agy config format may change as the tool evolves',
      '',
    ];

    for (const lsp of successfulLsps) {
      const config = getLspCommand(lsp.lspId);
      if (config) {
        sections.push(`${lsp.lspId}:`);
        sections.push(`  command: ${config.command}`);
        if (config.args.length > 0) {
          sections.push(`  args: [${config.args.join(', ')}]`);
        }
        sections.push('');
      }
    }

    return [
      {
        path: '.agy/tools.yaml',
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
 * Create Agy LSP generator
 */
export function createAgyLspGenerator(): LspConfigGenerator {
  return new AgyLspGenerator();
}
