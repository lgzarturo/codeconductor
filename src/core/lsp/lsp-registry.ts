import type { LspDefinition } from '../../domain/lsp/lsp-definition';

const LSP_DEFINITIONS: readonly LspDefinition[] = [
  {
    id: 'typescript',
    language: 'typescript',
    serverName: 'TypeScript Language Server',
    packageManager: 'npm',
    package: 'typescript-language-server',
    binaryName: 'typescript-language-server',
    installCmd: 'npm install -g typescript-language-server',
    versionFlag: '--version',
    npmDetect: 'typescript-language-server',
  },
  {
    id: 'php',
    language: 'php',
    serverName: 'Intelephense',
    packageManager: 'npm',
    package: '@bmewburn/vscode-intelephense-client',
    binaryName: 'intelephense',
    installCmd: 'npm install -g @bmewburn/vscode-intelephense-client',
    versionFlag: '--version',
    npmDetect: '@bmewburn/vscode-intelephense-client',
  },
  {
    id: 'python',
    language: 'python',
    serverName: 'Python LSP Server',
    packageManager: 'pip',
    package: 'python-lsp-server',
    binaryName: 'pylsp',
    installCmd: 'pip install --user python-lsp-server',
    versionFlag: '--version',
    pipDetect: 'python-lsp-server',
  },
  {
    id: 'kotlin',
    language: 'kotlin',
    serverName: 'Kotlin Language Server',
    packageManager: 'binary',
    package: 'kotlin-language-server',
    binaryName: 'kotlin-language-server',
    installCmd: 'Download from GitHub releases',
    versionFlag: '--version',
    binaryPlatforms: {
      'linux-x64': {
        url: 'https://github.com/fwcd/kotlin-language-server/releases/latest/download/server-linux-x64.tar.gz',
      },
      'linux-arm64': {
        url: 'https://github.com/fwcd/kotlin-language-server/releases/latest/download/server-linux-arm64.tar.gz',
      },
      'darwin-x64': {
        url: 'https://github.com/fwcd/kotlin-language-server/releases/latest/download/server-macos-x64.tar.gz',
      },
      'darwin-arm64': {
        url: 'https://github.com/fwcd/kotlin-language-server/releases/latest/download/server-macos-arm64.tar.gz',
      },
      'win32-x64': {
        url: 'https://github.com/fwcd/kotlin-language-server/releases/latest/download/server-windows-x64.zip',
      },
    },
  },
];

/**
 * Resolve LSP definitions for given languages
 */
export function resolveLsps(languages: readonly string[]): readonly LspDefinition[] {
  const languageToLspId: Record<string, string> = {
    typescript: 'typescript',
    javascript: 'typescript',
    php: 'php',
    python: 'python',
    java: 'kotlin',
    kotlin: 'kotlin',
  };

  const resolvedIds = new Set<string>();
  for (const lang of languages) {
    const lspId = languageToLspId[lang.toLowerCase()];
    if (lspId) {
      resolvedIds.add(lspId);
    }
  }

  return LSP_DEFINITIONS.filter((def) => resolvedIds.has(def.id));
}

/**
 * Get LSP definition by ID
 */
export function getLspById(id: string): LspDefinition | undefined {
  return LSP_DEFINITIONS.find((def) => def.id === id);
}

/**
 * Get all LSP definitions
 */
export function getAllLsps(): readonly LspDefinition[] {
  return LSP_DEFINITIONS;
}
