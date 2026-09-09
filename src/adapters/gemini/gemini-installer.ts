import type { GeneratedFile } from '../../core/generation/generated-file';
import type { RunnerInstaller } from '../../core/runner/runner-installer';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { generateGeminiFiles } from './gemini-council-generator';

export class GeminiInstaller implements RunnerInstaller {
  readonly name = 'gemini';
  readonly target = 'gemini';
  private spec: CouncilSpec | null = null;

  setSpec(spec: CouncilSpec): void {
    this.spec = spec;
  }

  async generate(): Promise<GeneratedFile[]> {
    if (!this.spec) {
      throw new Error('Council spec not set');
    }
    return generateGeminiFiles(this.spec);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Create a new Gemini installer pre-configured with a council specification
 *
 * @param spec The council specification to install
 * @returns Configured installer instance
 */
export function createGeminiInstaller(spec: CouncilSpec): RunnerInstaller {
  const installer = new GeminiInstaller();
  installer.setSpec(spec);
  return installer;
}
