import type { GeneratedFile } from '../../core/generation/generated-file';
import type { RunnerInstaller } from '../../core/runner/runner-installer';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { generateCursorFiles } from './cursor-council-generator';

export class CursorInstaller implements RunnerInstaller {
  readonly name = 'cursor';
  readonly target = 'cursor';
  private spec: CouncilSpec | null = null;

  setSpec(spec: CouncilSpec): void {
    this.spec = spec;
  }

  async generate(): Promise<GeneratedFile[]> {
    if (!this.spec) {
      throw new Error('Council spec not set');
    }
    return generateCursorFiles(this.spec);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Create a new Cursor installer pre-configured with a council specification
 *
 * @param spec The council specification to install
 * @returns Configured installer instance
 */
export function createCursorInstaller(spec: CouncilSpec): RunnerInstaller {
  const installer = new CursorInstaller();
  installer.setSpec(spec);
  return installer;
}
