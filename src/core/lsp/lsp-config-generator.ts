import type { GeneratedFile } from '../../core/generation/generated-file';
import type { RunnerTarget } from '../../core/runner/runner-target';
import type { LspInstallResult } from '../../domain/lsp/lsp-definition';

/**
 * LSP config generator interface
 */
export interface LspConfigGenerator {
  readonly name: string;
  readonly target: RunnerTarget;
  generate(installedLsps: readonly LspInstallResult[]): readonly GeneratedFile[];
  isAvailable(): Promise<boolean>;
}
