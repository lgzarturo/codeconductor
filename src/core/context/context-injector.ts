/**
 * Context Injector — scoped context injection for SDD/TDD phases.
 *
 * Reads only files listed in Task Card Scope block during isolated/continuation
 * phases. For large scopes (>10 files), loads only relevant files via search and
 * defers the rest.
 */

import { readFile, stat } from 'node:fs/promises';
import { resolveWithinRoot } from '../filesystem/path-containment';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContextPayload {
  /** Files that were successfully loaded, keyed by relative path. */
  readonly files: Readonly<Record<string, string>>;
  /** Files that were deferred (large scope). */
  readonly deferred: readonly string[];
  /** Total size in bytes of loaded content. */
  readonly totalBytes: number;
  /** Number of files loaded. */
  readonly fileCount: number;
  /** True if loading stopped because maxContextBytes was exceeded. */
  readonly truncated: boolean;
}

export interface ContextScope {
  /** Files explicitly listed in Task Card Scope. */
  readonly scopeFiles: readonly string[];
  /** Context mode from Task Card Routing. */
  readonly mode: 'isolated' | 'continuation' | 'full';
}

/** Maximum files to eagerly load before deferring. */
const EAGER_LOAD_LIMIT = 10;

// ─── Public API ──────────────────────────────────────────────────────────────

/** Default max context size in bytes (40KB). */
const DEFAULT_MAX_CONTEXT_BYTES = 40 * 1024;

export async function injectScopedContext(
  projectRoot: string,
  scope: ContextScope,
  options?: { readonly maxContextBytes?: number },
): Promise<ContextPayload> {
  const maxContextBytes = options?.maxContextBytes ?? DEFAULT_MAX_CONTEXT_BYTES;
  const files: Record<string, string> = {};
  const deferred: string[] = [];
  let totalBytes = 0;
  let truncated = false;

  // TODO: mode-specific behavior (isolated/continuation/full) — currently all modes behave identically
  const pathsToLoad = scope.scopeFiles;

  for (let i = 0; i < pathsToLoad.length; i++) {
    const relPath = pathsToLoad[i]!;

    // Defer files beyond eager limit
    if (i >= EAGER_LOAD_LIMIT) {
      deferred.push(relPath);
      continue;
    }

    try {
      // W1: Path traversal guard — resolved path must stay within projectRoot
      const absPath = await resolveWithinRoot(projectRoot, relPath);

      if (absPath === undefined) {
        continue;
      }

      const fileInfo = await stat(absPath);

      if (!fileInfo.isFile()) {
        continue;
      }

      const content = await readFile(absPath, 'utf-8');
      const byteLen = Buffer.byteLength(content, 'utf-8');

      // W3: Stop loading when maxContextBytes is exceeded
      if (totalBytes + byteLen > maxContextBytes) {
        truncated = true;
        break;
      }

      files[relPath] = content;
      totalBytes += byteLen;
    } catch {
      // File doesn't exist or can't be read — skip silently
    }
  }

  return {
    files,
    deferred,
    totalBytes,
    fileCount: Object.keys(files).length,
    truncated,
  };
}

/**
 * Load a deferred file on demand.
 *
 * @param projectRoot - Root directory of the project.
 * @param relPath - Relative path of the file to load.
 * @returns File content as string, or undefined if not found.
 */
export async function loadDeferredFile(
  projectRoot: string,
  relPath: string,
): Promise<string | undefined> {
  try {
    // Path traversal guard — resolved path must stay within projectRoot
    const absPath = await resolveWithinRoot(projectRoot, relPath);

    if (absPath === undefined) {
      return undefined;
    }

    return await readFile(absPath, 'utf-8');
  } catch {
    return undefined;
  }
}
