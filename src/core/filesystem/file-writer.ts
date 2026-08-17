import { access } from 'node:fs/promises';
import { relative } from 'node:path';
import { CredentialGuardError, UnsafeOperationError, ValidationError } from '../../cli/errors';
import { err, ok, type Result } from '../../utils/result';
import type { CodeConductorConfig } from '../config/codeconductor-config';
import type { FileWriteResult, GeneratedFile } from '../generation/generated-file';
import { loadCredentialPatterns } from './credential-guard';
import { writeContainedFile } from './path-containment';
import { isProtectedPath, scanForCredentials, validateWritePath } from './safety';

/**
 * Write options
 */
export interface WriteOptions {
  readonly force: boolean;
  readonly dryRun: boolean;
  /** CodeConductor config — used to load project-specific secret patterns. */
  readonly config?: CodeConductorConfig;
  /**
   * Containment root for the final write. Required for any non-dry-run write so a
   * symlinked parent cannot redirect a generated file outside the install target.
   */
  readonly projectRoot?: string;
}

/**
 * Write generated files to disk
 */
export async function writeGeneratedFiles(
  files: readonly GeneratedFile[],
  options: WriteOptions
): Promise<FileWriteResult[]> {
  const results: FileWriteResult[] = [];

  // Credential scan — must happen before any write to guarantee no partial writes.
  // Scan ALL files including protected paths — credentials should never be written anywhere.
  const secretPatterns = await loadCredentialPatterns(options.config);
  const allMatches = files.flatMap((file) => {
    return scanForCredentials(file.path, file.content, secretPatterns);
  });

  if (allMatches.length > 0) {
    throw new CredentialGuardError(
      `Credential leak detected in ${allMatches.length} file(s). No files written.`,
      allMatches
    );
  }

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

    if (options.projectRoot === undefined) {
      results.push({
        path: file.path,
        success: false,
        error: 'projectRoot is required for contained writes',
      });
      continue;
    }

    try {
      await writeContainedFile(
        options.projectRoot,
        relative(options.projectRoot, file.path),
        file.content,
        { force: true }
      );
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
