import type { GeneratedFile } from '../../core/generation/generated-file';
import type { RunnerInstaller } from '../../core/runner/runner-installer';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { generateClaudeFiles } from './claude-council-generator';

/**
 * Claude installer
 */
export class ClaudeInstaller implements RunnerInstaller {
  readonly name = 'claude';
  readonly target = 'claude';

  private spec: CouncilSpec | null = null;

  setSpec(spec: CouncilSpec): void {
    this.spec = spec;
  }

  async generate(): Promise<GeneratedFile[]> {
    if (!this.spec) {
      throw new Error('Council spec not set');
    }
    return generateClaudeFiles(this.spec);
  }

  async isAvailable(): Promise<boolean> {
    // Claude is always "available" as we generate files for it
    return true;
  }
}

/**
 * Create Claude installer
 */
export function createClaudeInstaller(spec: CouncilSpec): RunnerInstaller {
  const installer = new ClaudeInstaller();
  installer.setSpec(spec);
  return installer;
}
