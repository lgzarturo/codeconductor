/**
 * Tests for the complexity-auditor's contract and routing integration.
 *
 * These tests verify the documentation/contract surfaces that govern how
 * `complexity-auditor` is wired into the CodeConductor workflow:
 *
 *  - Routing policy registers complexity-auditor as the final step before
 *    Reviewer (AC #1)
 *  - Auditor contract forbids new dependencies, only delete/replace-native (AC #2)
 *  - Auditor analyzes code for bloat, abstractions, non-native solutions (AC #3)
 *  - Agent scorecard includes LOC removed, deps avoided, cyclomatic reduction (AC #4)
 *  - Scorecard integrates cc-gain calculation (AC #5)
 */

import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const ROUTING_POLICY = join(REPO_ROOT, 'docs', 'routing-policy.md');
const SCORECARD = join(REPO_ROOT, 'docs', 'agent-scorecard.md');
const AGENTS_MD = join(REPO_ROOT, 'AGENTS.md');
const AUDITOR_PROMPT = join(
  REPO_ROOT,
  'presets',
  'opencode',
  'agents',
  'complexity-auditor.md',
);

describe('routing-policy.md registers complexity-auditor (AC #1)', () => {
  test('routing policy file exists and is readable', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('routes refactor (medium-high) through complexity-auditor before reviewer', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    // The refactor row should contain complexity-auditor and the auditor
    // must come before reviewer in the sequence.
    const refactorMatch = content.match(
      /\|\s*Refactor\s*\|[^|]*\|[^|]*complexity-auditor[^|]*reviewer/i,
    );
    expect(refactorMatch).not.toBeNull();
  });

  test('routes API change through complexity-auditor before reviewer', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    const apiMatch = content.match(
      /\|\s*API change\s*\|[^|]*\|[^|]*complexity-auditor[^|]*reviewer/i,
    );
    expect(apiMatch).not.toBeNull();
  });

  test('routes database migration through complexity-auditor before reviewer', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    const dbMatch = content.match(
      /\|\s*Database migration\s*\|[^|]*\|[^|]*complexity-auditor[^|]*reviewer/i,
    );
    expect(dbMatch).not.toBeNull();
  });

  test('lists complexity-auditor as a standalone route', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    // The row looks like: | Complexity audit only| any | `complexity-auditor` ...
    // Match the row start, any cells, and the auditor cell.
    expect(content).toMatch(/\|\s*Complexity audit only[\s\S]*?complexity-auditor/i);
  });

  test('the rules section states auditor always runs before reviewer', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    // A rule that explicitly says auditor runs before reviewer
    expect(content).toMatch(/complexity[- ]auditor.*before.*reviewer/i);
  });

  test('policy version reflects the auditor addition', async () => {
    const content = await readFile(ROUTING_POLICY, 'utf-8');
    // v0.2.0 should be present and the changelog should mention complexity-auditor
    expect(content).toMatch(/v0\.2\.0/);
    expect(content).toMatch(/Add complexity-auditor route/i);
  });
});

describe('complexity-auditor contract (AC #2)', () => {
  test('agent prompt file exists and is readable', async () => {
    const content = await readFile(AUDITOR_PROMPT, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('auditor may only propose delete or replace-native actions', async () => {
    const content = await readFile(AUDITOR_PROMPT, 'utf-8');
    expect(content).toMatch(/deletions/i);
    expect(content).toMatch(/native replacements/i);
  });

  test('auditor is explicitly forbidden from proposing new dependencies', async () => {
    const content = await readFile(AUDITOR_PROMPT, 'utf-8');
    // The contract must contain a statement forbidding new dependencies.
    // The text wraps across lines, so use a flexible pattern.
    expect(content).toMatch(/never propose\s+new dependencies|do not propose new dependencies/i);
  });

  test('auditor is forbidden from editing files (permission: edit deny)', async () => {
    const content = await readFile(AUDITOR_PROMPT, 'utf-8');
    // The frontmatter should declare edit: deny
    expect(content).toMatch(/edit:\s*deny/);
  });

  test('auditor documents the 7 bloat patterns', async () => {
    const content = await readFile(AUDITOR_PROMPT, 'utf-8');
    const patterns = [
      'single-implementation-interface',
      'trivial-wrapper',
      'one-method-class',
      'unused-import',
      'external-dep-for-native',
      'excessive-abstraction',
      'dead-code',
    ];
    for (const pattern of patterns) {
      expect(content).toContain(pattern);
    }
  });

  test('auditor contract forbids suggesting new abstractions or external libraries', async () => {
    const content = await readFile(AUDITOR_PROMPT, 'utf-8');
    // The contract must forbid new abstractions and external libraries.
    // The "What You Never Do" section explicitly lists these forbidden actions.
    expect(content).toMatch(/never propose[\s\S]*?new abstractions|new abstractions or design patterns/i);
    expect(content).toMatch(/external libraries/i);
  });

  test('auditor defines its analysis axes (LOC, deps, cyclomatic, bloat)', async () => {
    const content = await readFile(AUDITOR_PROMPT, 'utf-8');
    expect(content).toMatch(/LOC delta/);
    expect(content).toMatch(/Dependency delta/);
    expect(content).toMatch(/Cyclomatic complexity/);
    expect(content).toMatch(/Bloat patterns/);
  });
});

describe('agent-scorecard.md integrates cc-gain (AC #4 & #5)', () => {
  test('scorecard file exists and is readable', async () => {
    const content = await readFile(SCORECARD, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('scorecard includes a Complexity Diffusion / cc-gain criterion', async () => {
    const content = await readFile(SCORECARD, 'utf-8');
    // The 8th criterion should reference cc-gain
    expect(content).toMatch(/cc[- ]gain/i);
    expect(content).toMatch(/Complexity Diffusion/i);
  });

  test('cc-gain criterion uses the documented formula', async () => {
    const content = await readFile(SCORECARD, 'utf-8');
    // The formula must mention each component: locRemoved, depsAvoided,
    // complexityReduced, abstractionFindings
    expect(content).toMatch(/locRemoved\s*\*\s*0\.4/);
    expect(content).toMatch(/depsAvoided\s*\*\s*1\.5/);
    expect(content).toMatch(/complexityReduced\s*\*\s*2\.0/);
    expect(content).toMatch(/abstractionFindings\s*\*\s*1\.0/);
  });

  test('cc-gain criterion uses 5% weight in the scorecard', async () => {
    const content = await readFile(SCORECARD, 'utf-8');
    // The 8th criterion row should show 5% weight
    expect(content).toMatch(/\|\s*8\s*\|[^|]*cc[- ]gain[^|]*\|\s*5\s*%/i);
  });

  test('cc-gain score mapping uses verdict boundaries', async () => {
    const content = await readFile(SCORECARD, 'utf-8');
    // The mapping must be present in either order, e.g.:
    //   "**0** — cc-gain verdict is negative" or "negative verdict → 0"
    // The pattern below matches both formats.
    expect(content).toMatch(/\*\*0\*\*[^|]*negative|negative[^|]*\*\*0\*\*/i);
    expect(content).toMatch(/\*\*1\*\*[^|]*neutral|neutral[^|]*\*\*1\*\*/i);
    expect(content).toMatch(/\*\*2\*\*[^|]*positive|positive[^|]*\*\*2\*\*/i);
    expect(content).toMatch(/\*\*3\*\*[^|]*positive|positive[^|]*\*\*3\*\*/i);
  });

  test('scorecard weighted formula sums all 8 criteria', async () => {
    const content = await readFile(SCORECARD, 'utf-8');
    // All 8 criteria should appear in the weighted sum formula
    for (let i = 1; i <= 8; i++) {
      expect(content).toMatch(new RegExp(`score_${i}\\s*\\*\\s*0\\.`));
    }
  });
});

describe('AGENTS.md mirrors the routing policy (AC #1, #3)', () => {
  test('AGENTS.md includes complexity-auditor in the routing table', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');
    expect(content).toMatch(/Refactor\s*\|[^|]*\|[^|]*complexity-auditor/i);
    expect(content).toMatch(/API change\s*\|[^|]*\|[^|]*complexity-auditor/i);
    expect(content).toMatch(/Database migration\s*\|[^|]*\|[^|]*complexity-auditor/i);
  });

  test('AGENTS.md defines the complexity-auditor role', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');
    expect(content).toMatch(/### complexity-auditor/);
    // Role description should mention analyzing for bloat / abstractions
    expect(content).toMatch(/[Bb]loat/);
    expect(content).toMatch(/[Aa]bstraction/);
  });

  test('AGENTS.md complexity-auditor has edit: deny', async () => {
    const content = await readFile(AGENTS_MD, 'utf-8');
    // Find the complexity-auditor section and verify it has edit: deny
    const auditorSection = content.match(
      /### complexity-auditor[\s\S]*?(?=\n### |\n---)/,
    );
    expect(auditorSection).not.toBeNull();
    // Allow for markdown backticks around "deny" (e.g., `` `deny` ``)
    expect(auditorSection![0]).toMatch(/edit:\s*`?deny`?/);
  });
});
