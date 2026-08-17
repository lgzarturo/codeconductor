/**
 * Path containment — shared root-confinement primitives for reads and writes.
 *
 * Every caller supplies a project root and a relative path. Lexical checks
 * alone are not enough: a symlink or junction can point outside the root, so
 * both root and candidate are canonicalized before the final decision.
 */

import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, type FileHandle } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { validateWritePath } from './safety';

/** Absent on Windows, where `0` leaves the flag a harmless no-op. */
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

/** Errno values an `O_NOFOLLOW` open reports when the leaf is a symlink. */
const SYMLINK_OPEN_CODES: ReadonlySet<string> = new Set(['ELOOP', 'EMLINK', 'EFTYPE']);

/**
 * A contained write refused on its own terms — escaping, protected, symlinked,
 * swapped, or already present. Callers map this to a controlled exit code
 * instead of treating it as an unexpected failure.
 */
export class OutputPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutputPathError';
  }
}

/** True when `target` is strictly inside `root`, comparing path segments. */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * True when `absolutePath` resolves under a protected project location
 * (`.git`, `.env*`, `secrets`, …), including when reached through a directory
 * symlink whose leaf name is innocent.
 */
function isProtectedUnderRoot(rootReal: string, absolutePath: string): boolean {
  if (absolutePath === rootReal) {
    return false;
  }
  const relFromRoot = relative(rootReal, absolutePath);
  if (
    relFromRoot === '' ||
    relFromRoot === '..' ||
    relFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(relFromRoot)
  ) {
    return true;
  }
  return !validateWritePath(relFromRoot);
}

/**
 * Resolve a relative path to a canonical path guaranteed to live inside the root.
 *
 * Inputs are relative by contract, so absolute paths are rejected outright. The
 * returned path is the canonical one and is what callers must stat and read.
 *
 * @returns The canonical path, or undefined when the entry escapes the root.
 * @throws When the path does not exist or cannot be canonicalized.
 */
export async function resolveWithinRoot(
  projectRoot: string,
  relPath: string,
): Promise<string | undefined> {
  if (isAbsolute(relPath)) {
    return undefined;
  }

  const rootAbs = resolve(projectRoot);
  const candidate = resolve(rootAbs, relPath);

  if (!isInside(rootAbs, candidate)) {
    return undefined;
  }

  const rootReal = await realpath(rootAbs);
  const candidateReal = await realpath(candidate);

  if (!isInside(rootReal, candidateReal)) {
    return undefined;
  }

  return candidateReal;
}

/**
 * Read a relative file through a held descriptor after re-validating that the
 * path still names the same contained regular file. This closes the gap between
 * `realpath` validation and a later path-based read.
 */
export async function readFileWithinRoot(
  projectRoot: string,
  relPath: string,
): Promise<string | undefined> {
  const candidateReal = await resolveWithinRoot(projectRoot, relPath);
  if (candidateReal === undefined) {
    return undefined;
  }

  const rootReal = await realpath(resolve(projectRoot));
  let handle: FileHandle | undefined;
  try {
    handle = await open(candidateReal, constants.O_RDONLY | O_NOFOLLOW);
    const fdStat = await handle.stat();
    if (!fdStat.isFile()) {
      return undefined;
    }

    const currentReal = await realpath(candidateReal);
    if (!isInside(rootReal, currentReal)) {
      return undefined;
    }
    const pathStat = await lstat(candidateReal);
    if (
      pathStat.isSymbolicLink() ||
      pathStat.dev !== fdStat.dev ||
      pathStat.ino !== fdStat.ino
    ) {
      return undefined;
    }

    return await handle.readFile('utf-8');
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Canonicalize the deepest existing ancestor of `target`, keeping the segments
 * that do not exist yet.
 */
async function canonicalizeExistingPrefix(
  target: string,
): Promise<{ readonly base: string; readonly pending: string[] }> {
  const pending: string[] = [];
  let current = target;

  for (;;) {
    try {
      return { base: await realpath(current), pending };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      pending.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve a relative output path to a canonical absolute path inside the root.
 *
 * Output paths may not exist yet, so canonicalization stops at the deepest
 * existing ancestor: that ancestor must resolve inside the root, which blocks
 * writes through a symlinked parent while still allowing new nested paths.
 *
 * Existing leaf symlinks are rejected even when their target is inside the
 * root — writes must target a regular path, never a link.
 *
 * @returns The canonical absolute path, or undefined when it escapes the root
 *          or canonicalizes onto a protected location such as `.git`.
 */
export async function resolveOutputWithinRoot(
  projectRoot: string,
  relPath: string,
): Promise<string | undefined> {
  if (relPath === '' || isAbsolute(relPath)) {
    return undefined;
  }

  const rootAbs = resolve(projectRoot);
  const candidate = resolve(rootAbs, relPath);

  if (!isInside(rootAbs, candidate)) {
    return undefined;
  }

  try {
    const leaf = await lstat(candidate);
    if (leaf.isSymbolicLink()) {
      return undefined;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const rootReal = await realpath(rootAbs);
  const { base, pending } = await canonicalizeExistingPrefix(candidate);

  // The target already exists: `base` is its canonical path.
  if (pending.length === 0) {
    if (!isInside(rootReal, base) || isProtectedUnderRoot(rootReal, base)) {
      return undefined;
    }
    return base;
  }

  if (base !== rootReal && !isInside(rootReal, base)) {
    return undefined;
  }
  if (isProtectedUnderRoot(rootReal, base)) {
    return undefined;
  }

  const canonical = join(base, ...pending);
  if (!isInside(rootReal, canonical) || isProtectedUnderRoot(rootReal, canonical)) {
    return undefined;
  }
  return canonical;
}

/**
 * Prove the open descriptor is a regular file that still lives inside the root.
 *
 * The descriptor is already pinned to one inode, so nothing swapped in after
 * the open can redirect the bytes; what remains is to show that the inode we
 * hold is the one the contained path names. Canonicalizing the path re-reads
 * every parent, so a directory replaced between resolution and open shows up
 * either as an escaping canonical path or as a device/inode mismatch — and in
 * both cases the write is abandoned before it starts.
 */
async function assertContainedRegularHandle(
  handle: FileHandle,
  rootReal: string,
  outputPath: string,
  relPath: string,
): Promise<string> {
  const fdStat = await handle.stat();
  if (!fdStat.isFile()) {
    throw new OutputPathError(`Output path is not a regular file: ${relPath}`);
  }

  const openedReal = await realpath(outputPath);
  if (!isInside(rootReal, openedReal)) {
    throw new OutputPathError(`Output path escapes the project root: ${relPath}`);
  }
  if (isProtectedUnderRoot(rootReal, openedReal)) {
    throw new OutputPathError(`Output path is protected: ${relPath}`);
  }

  const pathStat = await lstat(outputPath);
  if (pathStat.isSymbolicLink()) {
    throw new OutputPathError(`Output path is a symlink: ${relPath}`);
  }
  if (pathStat.dev !== fdStat.dev || pathStat.ino !== fdStat.ino) {
    throw new OutputPathError(`Output path changed during write: ${relPath}`);
  }

  return openedReal;
}

/**
 * Acquire a write handle on the leaf without following a symlink and without
 * truncating, so the descriptor can be validated before anything is destroyed.
 *
 * Without `force` a single exclusive create is both the creation and the
 * existence check, and it is atomic against a concurrent creator. With `force`
 * an existing file is preferred and created only when absent; losing either
 * side of that race is expected, so the fallbacks cover both directions and
 * terminate after one round trip.
 *
 * `O_NOFOLLOW` only guards the leaf — Node exposes no `openat`-style API for
 * walking parents descriptor by descriptor, so parent swaps are caught after
 * the fact by the identity check rather than prevented here.
 */
async function openOutputHandle(outputPath: string, force: boolean): Promise<FileHandle> {
  const exclusiveCreate =
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | O_NOFOLLOW;

  if (!force) {
    return await open(outputPath, exclusiveCreate);
  }

  const openExisting = constants.O_WRONLY | O_NOFOLLOW;

  try {
    return await open(outputPath, openExisting);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    return await open(outputPath, exclusiveCreate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  return await open(outputPath, openExisting);
}

/**
 * Write `content` to a relative path confined to the project root.
 *
 * `resolveOutputWithinRoot` is the only authority on whether the destination is
 * allowed; it runs once before the parents are created and again afterwards, so
 * a parent swapped for an escaping link mid-mkdir is caught. What remains here
 * is the descriptor identity check, which closes the window between that second
 * resolution and the open.
 *
 * The leaf is opened with `O_NOFOLLOW` and without `O_TRUNC`, and — when it has
 * to be created — with `O_EXCL`. Nothing is destroyed until the held descriptor
 * has been shown to be a regular file that the contained path still names, at
 * which point the truncate and the write both go through that descriptor.
 * Symlink leaves are rejected even when their target is inside the root.
 *
 * @returns The canonical absolute path that was written.
 * @throws {OutputPathError} When the path escapes the root, is protected, is a
 *         symlink, changes underfoot, or exists while force is unset.
 */
export async function writeContainedFile(
  projectRoot: string,
  relPath: string,
  content: string,
  options?: { readonly force?: boolean },
): Promise<string> {
  const force = options?.force === true;

  // Before mkdir: a directory symlink into `.git`/`secrets` must not cause
  // nested directories to be created under the protected target.
  const resolved = await resolveOutputWithinRoot(projectRoot, relPath);
  if (resolved === undefined) {
    throw new OutputPathError(`Output path is not an allowed destination: ${relPath}`);
  }

  await mkdir(dirname(resolved), { recursive: true });

  // Re-resolve: a parent swapped for an escaping link while the directories
  // were being created must not be written through.
  const outputPath = await resolveOutputWithinRoot(projectRoot, relPath);
  if (outputPath === undefined) {
    throw new OutputPathError(`Output path is not an allowed destination: ${relPath}`);
  }

  const rootReal = await realpath(resolve(projectRoot));

  let handle: FileHandle | undefined;
  try {
    handle = await openOutputHandle(outputPath, force);
    const openedReal = await assertContainedRegularHandle(
      handle,
      rootReal,
      outputPath,
      relPath,
    );
    // The descriptor is only now known to be a contained regular file, so the
    // destructive half of the write happens last and goes through the handle —
    // never through the path, which may already mean something else.
    await handle.truncate(0);
    await handle.write(content, 0, 'utf-8');
    return openedReal;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      throw new OutputPathError(
        `Output file already exists: ${outputPath}. Re-run with --force to overwrite.`,
      );
    }
    if (code !== undefined && SYMLINK_OPEN_CODES.has(code)) {
      throw new OutputPathError(`Output path is a symlink: ${relPath}`);
    }
    if (code === 'EISDIR') {
      throw new OutputPathError(`Output path is not a regular file: ${relPath}`);
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Preflight an SEO/output write before any network work.
 *
 * Returns a human-readable error when the path is absolute, escapes, is
 * protected, is a symlink, or already exists without force. `undefined` means
 * the write is allowed to proceed.
 */
export async function preflightContainedOutput(
  projectRoot: string,
  relPath: string,
  options?: { readonly force?: boolean },
): Promise<string | undefined> {
  if (relPath === '' || isAbsolute(relPath)) {
    return `Invalid --output path: ${relPath}. It must be relative to the project root.`;
  }
  if (!validateWritePath(relPath)) {
    return `Output path is protected: ${relPath}`;
  }

  const resolved = await resolveOutputWithinRoot(projectRoot, relPath);
  if (resolved === undefined) {
    return `Invalid --output path: ${relPath}. It must be relative to the project root.`;
  }

  if (options?.force === true) {
    return undefined;
  }

  try {
    await lstat(resolved);
    return `Output file already exists: ${resolved}. Re-run with --force to overwrite.`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
