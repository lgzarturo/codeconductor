import type { GeneratedFile } from './generated-file'
import type { CouncilSpec } from '../../domain/council/council-spec'

/**
 * Base generator interface
 */
export interface Generator {
  readonly name: string

  /**
   * Generate files from council spec
   */
  generate(spec: CouncilSpec): Promise<GeneratedFile[]>
}

/**
 * Base generator implementation
 */
export abstract class BaseGenerator implements Generator {
  abstract readonly name: string

  abstract generate(spec: CouncilSpec): Promise<GeneratedFile[]>

  /**
   * Generate a single file
   */
  protected createFile(path: string, content: string, overwrite = false): GeneratedFile {
    return { path, content, overwrite }
  }
}