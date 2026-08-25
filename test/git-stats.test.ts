import { afterEach, describe, expect, test } from 'bun:test';
import {
  GIT_STATS_CACHE_TTL_MS,
  readGitChangeStats,
  resetGitStatsCache,
} from '../src/core/loop/git-stats';

afterEach(() => {
  resetGitStatsCache();
});

describe('readGitChangeStats cache', () => {
  test('reuses a fetch within the TTL', async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return { filesModified: 2, linesChanged: 4 };
    };

    const a = await readGitChangeStats('/tmp/cc-git-stats', { now: 0, fetch });
    const b = await readGitChangeStats('/tmp/cc-git-stats', {
      now: GIT_STATS_CACHE_TTL_MS - 1,
      fetch,
    });

    expect(a).toEqual({ filesModified: 2, linesChanged: 4 });
    expect(b).toEqual(a);
    expect(calls).toBe(1);
  });

  test('refetches after the TTL expires', async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return { filesModified: calls, linesChanged: 0 };
    };

    await readGitChangeStats('/tmp/cc-git-stats', { now: 0, fetch });
    await readGitChangeStats('/tmp/cc-git-stats', {
      now: GIT_STATS_CACHE_TTL_MS,
      fetch,
    });

    expect(calls).toBe(2);
  });
});
