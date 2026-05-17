import type { RunnerInstaller } from '../../core/runner/runner-installer'
import type { GeneratedFile } from '../../core/generation/generated-file'
import type { CouncilSpec } from '../../domain/council/council-spec'
import { generateCodexFiles } from './codex-council-generator'

/**
 * Codex installer
 */
export class CodexInstaller implements RunnerInstaller {
  readonly name = 'codex'
  readonly target = 'codex'

  private spec: CouncilSpec | null = null

  setSpec(spec: CouncilSpec): void {
    this.spec = spec
  }

  async generate(): Promise<GeneratedFile[]> {
    if (!this.spec) {
      throw new Error('Council spec not set')
    }
    return generateCodexFiles(this.spec)
  }

  async isAvailable(): Promise<boolean> {
    // Codex is always "available" as we generate files for it
    return true
  }
}

/**
 * Create Codex installer
 */
export function createCodexInstaller(spec: CouncilSpec): RunnerInstaller {
  const installer = new CodexInstaller()
  installer.setSpec(spec)
  return installer
}