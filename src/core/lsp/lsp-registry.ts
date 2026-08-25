import type { LspDefinition } from '../../domain/lsp/lsp-definition';

const LSP_DEFINITIONS: readonly LspDefinition[] = [
  {
    id: 'typescript',
    language: 'typescript',
    serverName: 'TypeScript Language Server',
    packageManager: 'npm',
    package: 'typescript-language-server@6.0.0',
    binaryName: 'typescript-language-server',
    installCmd: 'npm install -g typescript-language-server@6.0.0',
    versionFlag: '--version',
    npmDetect: 'typescript-language-server',
  },
  {
    id: 'php',
    language: 'php',
    serverName: 'Intelephense',
    packageManager: 'npm',
    // `@bmewburn/vscode-intelephense-client` was removed from the npm registry
    // (404); the published package is `intelephense`. Pinned to an exact
    // version — installing `latest` is a supply-chain risk.
    package: 'intelephense@1.18.5',
    binaryName: 'intelephense',
    installCmd: 'npm install -g intelephense@1.18.5',
    versionFlag: '--version',
    npmDetect: 'intelephense',
  },
  {
    id: 'python',
    language: 'python',
    serverName: 'Pyright',
    packageManager: 'npm',
    package: 'pyright@1.1.413',
    binaryName: 'pyright-langserver',
    installCmd: 'npm install -g pyright@1.1.413',
    versionFlag: '--version',
    npmDetect: 'pyright',
  },
  {
    id: 'kotlin',
    language: 'kotlin',
    serverName: 'Kotlin Language Server',
    packageManager: 'binary',
    package: 'kotlin-language-server',
    binaryName: 'kotlin-language-server',
    installCmd:
      'Pinned https download with sha256 (see binaryPlatforms). Unpinned /latest/ URLs are rejected.',
    versionFlag: '--version',
    // Binary platforms intentionally empty until a concrete release URL + sha256
    // are recorded. Fail closed rather than downloading mutable /latest/ assets.
    binaryPlatforms: {},
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
