import type { GeneratedFile } from '../generation/generated-file'

/**
 * Runner installer interface
 */
export interface RunnerInstaller {
  readonly name: string
  readonly target: string

  /**
   * Generate files for this runner
   */
  generate(): Promise<GeneratedFile[]>

  /**
   * Check if runner is available
   */
  isAvailable(): Promise<boolean>
}

/**
 * Installation result
 */
export interface InstallResult {
  readonly success: boolean
  readonly files: GeneratedFile[]
  readonly errors: string[]
}