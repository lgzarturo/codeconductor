import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { UnsafeOperationError, ValidationError } from '../../cli/errors';
import { err, ok, type Result } from '../../utils/result';
import type { FileWriteResult, GeneratedFile } from '../generation/generated-file';
import { validateWritePath } from './safety';

/**
 * Write options
 */
export interface WriteOptions {
  readonly force: boolean;
  readonly dryRun: boolean;
}

/**
 * Write generated files to disk
 */
export async function writeGeneratedFiles(
  files: readonly GeneratedFile[],
  options: WriteOptions
): Promise<FileWriteResult[]> {
  const results: FileWriteResult[] = [];

  for (const file of files) {
    // Validate path
    if (!validateWritePath(file.path)) {
      results.push({
        path: file.path,
        success: false,
        error: 'Protected path',
      });
      continue;
    }

    // Dry run - just report what would happen
    if (options.dryRun) {
      results.push({
        path: file.path,
        success: true,
      });
      continue;
    }

    // Check if file exists and not forcing
    if (!options.force) {
      try {
        await access(file.path);
        results.push({
          path: file.path,
          success: false,
          error: 'File exists, use --force to overwrite',
        });
        continue;
      } catch {
        // File doesn't exist, proceed
      }
    }

    try {
      // Ensure directory exists
      const dir = dirname(file.path);
      await mkdir(dir, { recursive: true });

      // Write file
      await writeFile(file.path, file.content, 'utf-8');
      results.push({
        path: file.path,
        success: true,
      });
    } catch (error) {
      results.push({
        path: file.path,
        success: false,
        error: String(error),
      });
    }
  }

  return results;
}

/**
 * Write a single file
 */
export async function writeSingleFile(
  path: string,
  content: string,
  options: WriteOptions
): Promise<Result<FileWriteResult, ValidationError | UnsafeOperationError>> {
  const results = await writeGeneratedFiles([{ path, content, overwrite: options.force }], options);
  const result = results[0];

  if (!result.success) {
    if (result.error === 'File exists, use --force to overwrite') {
      return err(new UnsafeOperationError(result.error));
    }
    return err(new ValidationError(result.error || 'Failed to write file'));
  }

  return ok(result);
}
