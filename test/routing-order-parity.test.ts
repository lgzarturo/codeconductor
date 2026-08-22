/**
 * Every routing surface that hands work to both agents must schedule `tester`
 * before `implementer`. The planner emits tests-first graphs; a routing table
 * that still says the reverse is not a stale sentence, it is a second answer to
 * the same question, and whichever copy an agent reads first wins.
 *
 * Iteration-loop prose ("cycle implementer → tester up to 3 times") is not a
 * delivery order and is left alone.
 */
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

const ROUTING_SURFACES = [
  'AGENTS.md',
  'docs/routing-policy.md',
  'docs/cc-commands.md',
  '.agents/AGENTS.md',
  'presets/codex/AGENTS.md',
  'presets/cursor/AGENTS.md',
  'presets/agy/AGENTS.md',
  '.agents/agents/orchestrator.md',
  '.cursor/agents/orchestrator.md',
  '.gemini/agents/orchestrator.md',
  'presets/cursor/agents/orchestrator.md',
  'presets/opencode/agents/orchestrator.md',
  '.agents/prompts/v0.5.0/orchestrator.md',
  '.cursor/prompts/v0.5.0/orchestrator.md',
  '.gemini/prompts/v0.5.0/orchestrator.md',
  'presets/opencode/prompts/v0.5.0/orchestrator.md',
  '.agents/agents/goal-planner.md',
  '.cursor/agents/goal-planner.md',
  '.gemini/agents/goal-planner.md',
  'presets/cursor/agents/goal-planner.md',
  'presets/opencode/agents/goal-planner.md',
  '.agents/prompts/v0.5.0/goal-planner.md',
  '.cursor/prompts/v0.5.0/goal-planner.md',
  '.gemini/prompts/v0.5.0/goal-planner.md',
  'presets/opencode/prompts/v0.5.0/goal-planner.md',
  '.agents/skills/cc-fix/SKILL.md',
  'presets/agy/skills/cc-fix/SKILL.md',
  '.cursor/rules/orchestration.mdc',
  'presets/cursor/rules/orchestration.mdc',
] as const;

const LOOP_PROSE = /\bloop\b|\biteration\b|\bcycle\b/i;

describe('routing copies schedule tester before implementer', () => {
  for (const rel of ROUTING_SURFACES) {
    test(rel, async () => {
      const content = await readFile(join(ROOT, rel), 'utf-8');

      const offenders = content
        .split('\n')
        .filter(
          (line) =>
            line.includes('→') &&
            line.includes('implementer') &&
            line.includes('tester') &&
            !LOOP_PROSE.test(line) &&
            line.indexOf('implementer') < line.indexOf('tester'),
        );

      expect(offenders, `${rel} routes implementer before tester`).toEqual([]);
    });
  }
});

/** Canonical agent-routing tables must keep tester on feature and low bug-fix rows. */
const AGENT_TABLE_SURFACES = [
  'AGENTS.md',
  'docs/routing-policy.md',
  '.agents/AGENTS.md',
  'presets/codex/AGENTS.md',
  'presets/cursor/AGENTS.md',
  'presets/agy/AGENTS.md',
] as const;

describe('agent routing tables keep tester on feature and low bug-fix', () => {
  for (const rel of AGENT_TABLE_SURFACES) {
    test(rel, async () => {
      const content = await readFile(join(ROOT, rel), 'utf-8');
      expect(content, rel).toMatch(
        /\|\s*New feature design\s*\|[^|]*\|\s*`architect`\s*→\s*`tester`\s*→\s*`implementer`/,
      );
      expect(content, rel).toMatch(
        /\|\s*Bug fix\s*\|\s*low\s*\|\s*`tester`\s*→\s*`implementer`/,
      );
    });
  }
});
