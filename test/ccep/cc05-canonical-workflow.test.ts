import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CCEP_COMMANDS } from '../../src/core/ccep/command-parser';
import { evaluateConfirmationGate } from '../../src/core/ccep/confirmation-gate';
import {
  loadAllWorkflowProfiles,
  loadWorkflowProfile,
} from '../../src/core/ccep/workflow-profile-loader';
import { ccepCommand } from '../../src/commands/ccep.command';
import type { PlannerOutputInput } from '../../src/validation/schemas';

const ROOT = resolve(import.meta.dir, '../..');

function phaseIds(command: Parameters<typeof loadWorkflowProfile>[0]): string[] {
  return loadWorkflowProfile(command).phases.map((p) => p.id);
}

function routingSequences(command: Parameters<typeof loadWorkflowProfile>[0]): string[][] {
  const profile = loadWorkflowProfile(command);
  const sequences = [profile.routing.default];
  for (const rule of profile.routing.riskRules ?? []) {
    sequences.push(rule.then);
  }
  return sequences;
}

function assertTestBeforeImplement(sequence: ReadonlyArray<string>, label: string): void {
  const testIdx = sequence.indexOf('test');
  const implementIdx = sequence.indexOf('implement');
  if (testIdx === -1 || implementIdx === -1) {
    return;
  }
  expect(testIdx, `${label} must place test before implement`).toBeLessThan(implementIdx);
}

describe('CC-05 canonical test-before-implement', () => {
  test('every profile that includes both test and implement places test first', () => {
    for (const command of CCEP_COMMANDS) {
      assertTestBeforeImplement(phaseIds(command), `${command} phases`);
      for (const sequence of routingSequences(command)) {
        assertTestBeforeImplement(sequence, `${command} routing ${sequence.join('→')}`);
      }
    }
  });

  test('feature, fix, db-migration, and openspec expose the TDD order explicitly', () => {
    expect(phaseIds('feature')).toEqual([
      'intake',
      'design',
      'test',
      'implement',
      'review',
      'docs',
    ]);
    expect(phaseIds('fix')).toEqual(['intake', 'test', 'implement', 'review']);
    expect(phaseIds('db-migration')).toEqual(['design', 'test', 'implement', 'review']);
    expect(phaseIds('openspec')).toEqual([
      'validate-backlog',
      'discover',
      'design',
      'test',
      'implement',
      'review',
    ]);
  });

  test('bundled YAML and TypeScript fallback stay in sync for TDD order', () => {
    const profiles = loadAllWorkflowProfiles();
    for (const command of ['feature', 'fix', 'db-migration', 'openspec'] as const) {
      const ids = profiles.get(command)!.phases.map((p) => p.id);
      assertTestBeforeImplement(ids, `loaded ${command}`);
    }
  });
});

describe('CC-05 ccep evaluate ConfirmationGate', () => {
  function planner(overrides: Partial<PlannerOutputInput> = {}): PlannerOutputInput {
    return {
      status: 'success',
      confidence: 0.9,
      goal: 'Ship safely',
      assumptions: [],
      risks: [],
      tasks: [],
      questionsForUser: [],
      needsConfirmation: false,
      ...overrides,
    };
  }

  test('evaluate returns proceed when the gate allows continuation', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: ROOT,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: JSON.stringify(planner()),
    });

    expect(result.code).toBe(0);
    const data = result.data as {
      success: boolean;
      stop: boolean;
      decision: ReturnType<typeof evaluateConfirmationGate>;
    };
    expect(data.success).toBe(true);
    expect(data.stop).toBe(false);
    expect(data.decision.stop).toBe(false);
  });

  test('evaluate stops with code 1 when planner asks clarifying questions', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: ROOT,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: JSON.stringify(
        planner({ questionsForUser: ['Are benefits global or per-plan?'] }),
      ),
    });

    expect(result.code).toBe(1);
    const data = result.data as {
      success: boolean;
      stop: boolean;
      decision: { reason?: string; message?: string };
    };
    expect(data.success).toBe(false);
    expect(data.stop).toBe(true);
    expect(data.decision.reason).toBe('clarification');
    expect(data.decision.message).toContain('global or per-plan');
  });

  test('evaluate rejects missing planner input', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: ROOT,
      output: 'json',
      command: 'fix',
      userRequest: 'login fails',
    });

    expect(result.code).toBe(1);
    const data = result.data as { success: boolean; errors: string[] };
    expect(data.success).toBe(false);
    expect(data.errors.join(' ')).toMatch(/input|planner/i);
  });
});

describe('CC-05 slash commands and loop labeling', () => {
  test('feature slash presets place Tester before Implementer', async () => {
    const paths = [
      'presets/cursor/commands/cc/feature.md',
      'presets/claude/commands/cc/feature.md',
      'presets/opencode/commands/cc-feature.md',
      'presets/agy/workflows/cc-feature.md',
    ];

    for (const rel of paths) {
      const content = await readFile(join(ROOT, rel), 'utf-8');
      const testStep = content.search(/## Step \d+ — Test/i);
      const implementStep = content.search(/## Step \d+ — Implementation/i);
      expect(testStep, rel).toBeGreaterThan(-1);
      expect(implementStep, rel).toBeGreaterThan(-1);
      expect(testStep, rel).toBeLessThan(implementStep);
      expect(content).toMatch(/ccep evaluate/i);
    }
  });

  test('fix slash presets route Tester before Implementer', async () => {
    const paths = [
      'presets/cursor/commands/cc/fix.md',
      'presets/claude/commands/cc/fix.md',
      'presets/opencode/commands/cc-fix.md',
      'presets/agy/workflows/cc-fix.md',
      '.agents/workflows/cc-fix.md',
    ];

    for (const rel of paths) {
      const content = await readFile(join(ROOT, rel), 'utf-8');
      expect(content, rel).toMatch(/(?:Tester|`tester`)\s*→\s*(?:Implementer|`implementer`)/);
      expect(content, rel).toMatch(/ccep evaluate/i);
      const testHeading = content.search(/## Step \d+ — .*Test/i);
      const implementHeading = content.search(/## Step \d+[a-z]? — Implementation/i);
      expect(testHeading, rel).toBeGreaterThan(-1);
      expect(implementHeading, rel).toBeGreaterThan(-1);
      expect(testHeading, rel).toBeLessThan(implementHeading);
      expect(content, rel).not.toMatch(
        /Route:[^\n]*`implementer`\s*→\s*`tester`/i,
      );
    }
  });

  test('CLI help marks the 8-phase workflow loop as experimental', async () => {
    const router = await readFile(join(ROOT, 'src/cli/router.ts'), 'utf-8');
    expect(router).toMatch(/experimental/i);
    expect(router).toMatch(/8-phase loop/i);
  });
});
