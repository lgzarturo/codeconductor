export interface LspCommandConfig {
  readonly command: string;
  readonly args: readonly string[];
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
