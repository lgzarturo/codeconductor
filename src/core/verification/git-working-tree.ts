import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Parse `git status --porcelain=v1 -z` output.
 * Format: `XY path\0`, and renames/copies add a second `orig\0` entry.
 * Deleted paths are skipped so callers see paths that still exist or are added.
 */
export function parsePorcelainStatus(raw: string): string[] {
  const out: string[] = [];
  const entries = raw.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? '';
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    if (x === 'R' || x === 'C') i++;
    if (x !== 'D' && y !== 'D') out.push(entry.slice(3));
  }
  return out;
}

export type WorkingTreePathsResult =
  | { readonly ok: true; readonly files: readonly string[] }
  | { readonly ok: false; readonly error: string };

/**
 * Union of paths changed vs `base` (committed diff) and dirty working-tree
 * paths (staged, unstaged, and untracked). Fail-closed when git evidence is missing.
 */
export async function listChangedAndWorkingTreePaths(
  cwd: string,
  base: string,
): Promise<WorkingTreePathsResult> {
  try {
    const [diff, status] = await Promise.all([
      execFileAsync(
        'git',
        ['diff', '--name-only', '--diff-filter=ACDMRTUXB', base],
        { cwd, encoding: 'utf8' },
      ),
      execFileAsync(
        'git',
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
      ),
    ]);

    const fromDiff = diff.stdout.trim().split('\n').filter(Boolean);
    const fromStatus = parsePorcelainStatus(status.stdout);
    const files = [...new Set([...fromDiff, ...fromStatus])].sort();
    return { ok: true, files };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Could not read git diff against '${base}': ${message}. Scope guard fails closed when evidence is missing.`,
    };
  }
}

/** Escape a literal path segment for use inside a RegExp. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Glob match for allowlists: `*` = one path segment, `**` = any depth.
 * Special regex characters in the pattern are escaped as literals.
 */
export function matchAllowlistPattern(file: string, pattern: string): boolean {
  const normalizedFile = file.split('\\').join('/');
  const normalizedPattern = pattern.split('\\').join('/');
  if (!normalizedPattern.includes('*')) {
    return normalizedFile === normalizedPattern;
  }

  let regex = '';
  let i = 0;
  while (i < normalizedPattern.length) {
    if (normalizedPattern[i] === '*' && normalizedPattern[i + 1] === '*') {
      const next = normalizedPattern[i + 2];
      if (next === '/') {
        regex += '(?:.*/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
      continue;
    }
    if (normalizedPattern[i] === '*') {
      regex += '[^/]*';
      i += 1;
      continue;
    }
    regex += escapeRegex(normalizedPattern[i]!);
    i += 1;
  }
  return new RegExp(`^${regex}$`).test(normalizedFile);
}
