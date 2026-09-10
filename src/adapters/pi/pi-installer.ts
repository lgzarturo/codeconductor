import type { GeneratedFile } from '../../core/generation/generated-file';
import type { RunnerInstaller } from '../../core/runner/runner-installer';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { generatePiFiles } from './pi-council-generator';

export class PiInstaller implements RunnerInstaller {
  readonly name = 'pi';
  readonly target = 'pi';
  private spec: CouncilSpec | null = null;

  setSpec(spec: CouncilSpec): void {
    this.spec = spec;
  }

  async generate(): Promise<GeneratedFile[]> {
    if (!this.spec) {
      throw new Error('Council spec not set');
    }
    return generatePiFiles(this.spec);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Create a new Pi installer pre-configured with a council specification
 *
 * @param spec The council specification to install
 * @returns Configured installer instance
 */
export function createPiInstaller(spec: CouncilSpec): RunnerInstaller {
  const installer = new PiInstaller();
  installer.setSpec(spec);
  return installer;
}
