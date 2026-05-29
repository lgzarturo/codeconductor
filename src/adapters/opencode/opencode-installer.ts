import type { GeneratedFile } from '../../core/generation/generated-file';
import type { RunnerInstaller } from '../../core/runner/runner-installer';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { generateOpenCodeFiles } from './opencode-council-generator';

/**
 * OpenCode installer
 */
export class OpenCodeInstaller implements RunnerInstaller {
  readonly name = 'opencode';
  readonly target = 'opencode';

  private spec: CouncilSpec | null = null;

  setSpec(spec: CouncilSpec): void {
    this.spec = spec;
  }

  async generate(): Promise<GeneratedFile[]> {
    if (!this.spec) {
      throw new Error('Council spec not set');
    }
    return generateOpenCodeFiles(this.spec);
  }

  async isAvailable(): Promise<boolean> {
    // OpenCode is always "available" as we generate files for it
    return true;
  }
}

/**
 * Create OpenCode installer
 */
export function createOpenCodeInstaller(spec: CouncilSpec): RunnerInstaller {
  const installer = new OpenCodeInstaller();
  installer.setSpec(spec);
  return installer;
}
