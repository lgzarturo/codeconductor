import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

export interface LspCommandConfig {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * The one piece every *-lsp-generator.ts shares verbatim: drop failed
 * installs before rendering. What comes after (JSON/YAML/TOML shape, file
 * path) genuinely differs per target and stays in each generator.
 */
export function filterSuccessfulLsps(
  installedLsps: readonly LspInstallResult[]
): readonly LspInstallResult[] {
  return installedLsps.filter((lsp) => lsp.status !== 'failed');
}

export type LanguageServerConfig = Record<string, LspCommandConfig>;

export function getLanguageServerConfig(lspIds: readonly string[]): LanguageServerConfig {
  const languageServers: LanguageServerConfig = {};

  for (const lspId of lspIds) {
    const config = getLspCommand(lspId);
    if (config) {
      languageServers[lspId] = { command: config.command, args: [...config.args] };
    }
  }

  return languageServers;
}

export function getLspCommand(lspId: string): LspCommandConfig | undefined {
  switch (lspId) {
    case 'typescript':
      return { command: 'typescript-language-server', args: ['--stdio'] };
    case 'php':
      return { command: 'intelephense', args: ['--stdio'] };
    case 'python':
      return { command: 'pyright-langserver', args: ['--stdio'] };
    case 'kotlin':
      return { command: 'kotlin-language-server', args: [] };
    default:
      return undefined;
  }
}
