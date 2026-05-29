/**
 * LSP package manager type
 */
export type LspPackageManager = 'npm' | 'pip' | 'binary';

/**
 * LSP language type
 */
export type LspLanguage = 'typescript' | 'php' | 'python' | 'kotlin';

/**
 * LSP installation status
 */
export interface LspStatus {
  readonly installed: boolean;
  readonly version?: string;
  readonly path?: string;
}

/**
 * LSP installation result
 */
export interface LspInstallResult {
  readonly lspId: string;
  readonly status: 'already-installed' | 'installed' | 'failed';
  readonly error?: string;
  readonly version?: string;
}

/**
 * LSP installation report
 */
export interface LspInstallReport {
  readonly results: readonly LspInstallResult[];
  readonly allSucceeded: boolean;
}

/**
 * LSP definition interface
 */
export interface LspDefinition {
  readonly id: string;
  readonly language: LspLanguage;
  readonly serverName: string;
  readonly packageManager: LspPackageManager;
  readonly package: string;
  readonly binaryName: string;
  readonly installCmd: string;
  readonly versionFlag: string;
  readonly npmDetect?: string;
  readonly pipDetect?: string;
  readonly binaryPlatforms?: Record<string, { url: string; sha256?: string }>;
}
