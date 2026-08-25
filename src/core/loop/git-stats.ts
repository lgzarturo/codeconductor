import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Shared TTL so loop iterations do not spawn git on every tick. */
export const GIT_STATS_CACHE_TTL_MS = 3_000;

export interface GitChangeStats {
  readonly filesModified: number;
  readonly linesChanged: number;
}

export type GitStatsReader = (cwd: string) => Promise<GitChangeStats>;

let cache:
  | { readonly cwd: string; readonly at: number; readonly stats: GitChangeStats }
  | undefined;

export function resetGitStatsCache(): void {
  cache = undefined;
}

function countPorcelain(output: string): number {
  return output.split('\n').filter((line) => line.trim().length > 0).length;
}

function countNumstat(output: string): number {
  let total = 0;
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split(/\s+/);
    const added = parseInt(parts[0] || '0', 10);
    const deleted = parseInt(parts[1] || '0', 10);
    if (!Number.isNaN(added)) total += added;
    if (!Number.isNaN(deleted)) total += deleted;
  }
  return total;
}

export async function fetchGitChangeStats(cwd: string): Promise<GitChangeStats> {
  try {
    const [status, diff] = await Promise.all([
      execFileAsync('git', ['status', '--porcelain'], {
        cwd,
        encoding: 'utf-8',
        timeout: 15_000,
      }),
      execFileAsync('git', ['diff', '--numstat'], {
        cwd,
        encoding: 'utf-8',
        timeout: 15_000,
      }),
    ]);
    return {
      filesModified: countPorcelain(status.stdout),
      linesChanged: countNumstat(diff.stdout),
    };
  } catch {
    return { filesModified: 0, linesChanged: 0 };
  }
}

export async function readGitChangeStats(
  cwd: string,
  options?: { readonly now?: number; readonly fetch?: GitStatsReader },
): Promise<GitChangeStats> {
  const now = options?.now ?? Date.now();
  const fetch = options?.fetch ?? fetchGitChangeStats;
  if (cache && cache.cwd === cwd && now - cache.at < GIT_STATS_CACHE_TTL_MS) {
    return cache.stats;
  }
  const stats = await fetch(cwd);
  cache = { cwd, at: now, stats };
  return stats;
}
