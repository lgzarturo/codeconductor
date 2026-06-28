import type { GeneratedFile } from '../../core/generation/generated-file';
import type { RunnerInstaller } from '../../core/runner/runner-installer';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { generateAgyFiles } from './agy-council-generator';

export class AgyInstaller implements RunnerInstaller {
  public readonly target = 'agy';
  private spec: CouncilSpec | null = null;

  setSpec(spec: CouncilSpec): void {
    this.spec = spec;
  }

  async generate(): Promise<GeneratedFile[]> {
    if (!this.spec) {
      throw new Error('Council spec not set');
    }
    return generateAgyFiles(this.spec);
  }
}

/**
 * Create a new agy installer pre-configured with a council specification
 *
 * @param spec The council specification to install
 * @returns Configured installer instance
 */
export function createAgyInstaller(spec: CouncilSpec): RunnerInstaller {
  const installer = new AgyInstaller();
  installer.setSpec(spec);
  return installer;
}
