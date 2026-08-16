/**
 * Path containment — shared root-confinement primitives for reads and writes.
 *
 * Every caller supplies a project root and a relative path. Lexical checks
 * alone are not enough: a symlink or junction can point outside the root, so
 * both root and candidate are canonicalized before the final decision.
 */

import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** True when `target` is strictly inside `root`, comparing path segments. */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
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
 * @returns The canonical absolute path, or undefined when it escapes the root.
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

  const rootReal = await realpath(rootAbs);
  const { base, pending } = await canonicalizeExistingPrefix(candidate);

  // The target already exists: `base` is its canonical path, with symlinks
  // resolved, so an escaping link is caught here.
  if (pending.length === 0) {
    return isInside(rootReal, base) ? base : undefined;
  }

  if (base !== rootReal && !isInside(rootReal, base)) {
    return undefined;
  }

  const canonical = join(base, ...pending);
  return isInside(rootReal, canonical) ? canonical : undefined;
}

/**
 * Write `content` to a relative path confined to the project root.
 *
 * The parent directory is canonicalized again after it is created, closing the
 * window between resolution and write. Without `force` the file is created
 * exclusively, so an existing file is never truncated — not even by a file
 * planted after resolution.
 *
 * @returns The canonical absolute path that was written.
 * @throws When the path escapes the root, or when it exists and force is unset.
 */
export async function writeContainedFile(
  projectRoot: string,
  relPath: string,
  content: string,
  options?: { readonly force?: boolean },
): Promise<string> {
  const target = await resolveOutputWithinRoot(projectRoot, relPath);

  if (target === undefined) {
    throw new Error(`Output path escapes the project root: ${relPath}`);
  }

  const parent = dirname(target);
  await mkdir(parent, { recursive: true });

  const rootReal = await realpath(resolve(projectRoot));
  const parentReal = await realpath(parent);

  if (parentReal !== rootReal && !isInside(rootReal, parentReal)) {
    throw new Error(`Output path escapes the project root: ${relPath}`);
  }

  const outputPath = join(parentReal, basename(target));

  try {
    await writeFile(outputPath, content, {
      encoding: 'utf-8',
      flag: options?.force === true ? 'w' : 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Output file already exists: ${outputPath}. Re-run with --force to overwrite.`,
      );
    }
    throw error;
  }

  return outputPath;
}
