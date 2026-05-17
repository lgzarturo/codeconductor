/**
 * Generated file representation
 */
export interface GeneratedFile {
  readonly path: string
  readonly content: string
  readonly overwrite: boolean
}

/**
 * File write result
 */
export interface FileWriteResult {
  readonly path: string
  readonly success: boolean
  readonly error?: string
}

/**
 * Create a generated file
 */
export function createGeneratedFile(
  path: string,
  content: string,
  overwrite = false
): GeneratedFile {
  return { path, content, overwrite }
}