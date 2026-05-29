export interface LspCommandConfig {
  readonly command: string;
  readonly args: readonly string[];
}

export function getLspCommand(lspId: string): LspCommandConfig | undefined {
  switch (lspId) {
    case 'typescript':
      return { command: 'typescript-language-server', args: ['--stdio'] };
    case 'php':
      return { command: 'intelephense', args: ['--stdio'] };
    case 'python':
      return { command: 'pylsp', args: [] };
    case 'kotlin':
      return { command: 'kotlin-language-server', args: [] };
    default:
      return undefined;
  }
}
