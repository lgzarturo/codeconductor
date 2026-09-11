/**
 * Assertions about currently-active agent-contract content. Split out of the
 * former prompt-v050.test.ts (deleted alongside presets/opencode/prompts/v0.1.0
 * through v0.6.0 — frozen historical contracts) because these two checks are
 * about live files, not the deprecated snapshots.
 */
import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

describe('active agent contracts', () => {
  test('opencode agents reflect the active v1.0.0 contracts', async () => {
    const agentsDir = resolve(import.meta.dir, '../presets/opencode/agents');
    for (const file of ['security-reviewer.md', 'goal-planner.md', 'contract-builder.md']) {
      const content = await Bun.file(join(agentsDir, file)).text();
      expect(content).toContain('v1.0.0');
    }
  });

  test('codex AGENTS.md includes contract-builder and DDD→SDD→TDD routing', async () => {
    const content = await Bun.file(
      resolve(import.meta.dir, '../presets/codex/AGENTS.md')
    ).text();
    expect(content).toMatch(/^###\s+contract-builder/m);
    expect(content).toMatch(
      /\|\s*DDD[→\-]>?SDD[→\-]>?TDD[^|]*\|[^|]*\|[^|]*contract-builder[^|]*architect[^|]*tester[^|]*implementer/i
    );
  });
});
