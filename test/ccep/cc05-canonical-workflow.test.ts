import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
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
      'wayfinding',
      'intake',
      'design',
      'test',
      'implement',
      'review',
      'docs',
    ]);
    expect(phaseIds('fix')).toEqual(['wayfinding', 'intake', 'test', 'implement', 'review']);
    expect(phaseIds('db-migration')).toEqual(['design', 'test', 'implement', 'review']);
    expect(phaseIds('openspec')).toEqual([
      'validate-backlog',
      'discover',
      'design',
      'test',
      'implement',
      'review',
    ]);
    expect(phaseIds('iterative')).toEqual([
      'wayfinding',
      'intake',
      'contract',
      'design',
      'test',
      'implement',
      'council-review',
      'docs',
    ]);
  });

  test('bundled YAML and TypeScript fallback stay in sync for TDD order', () => {
    const profiles = loadAllWorkflowProfiles();
    for (const command of ['feature', 'fix', 'db-migration', 'openspec', 'iterative'] as const) {
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

describe('CC-05 ccep file inputs stay inside the project root', () => {
  function planner(): PlannerOutputInput {
    return {
      status: 'success',
      confidence: 0.9,
      goal: 'Ship safely',
      assumptions: [],
      risks: [],
      tasks: [],
      questionsForUser: [],
      needsConfirmation: false,
    };
  }

  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cc-ccep-root-'));
    outside = await mkdtemp(join(tmpdir(), 'cc-ccep-outside-'));
    await writeFile(join(root, 'planner.json'), JSON.stringify(planner()), 'utf-8');
    await writeFile(join(outside, 'planner.json'), JSON.stringify(planner()), 'utf-8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  /** Only privilege errors are tolerated; anything else is a real defect. */
  async function trySymlink(target: string, linkPath: string): Promise<boolean> {
    try {
      await symlink(target, linkPath, 'file');
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') return false;
      throw error;
    }
  }

  test('evaluate reads a contained @file payload', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: root,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: '@planner.json',
    });

    expect(result.code).toBe(0);
    expect((result.data as { success: boolean }).success).toBe(true);
  });

  test('evaluate refuses an absolute @file payload', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: root,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: `@${join(outside, 'planner.json')}`,
    });

    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/input file/i);
  });

  test('evaluate refuses a traversing @file payload', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: root,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: `@../${basename(outside)}/planner.json`,
    });

    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/input file/i);
  });

  test('evaluate refuses an @file payload reached through a symlink', async () => {
    const created = await trySymlink(join(outside, 'planner.json'), join(root, 'linked.json'));
    if (!created) return;

    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: root,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: '@linked.json',
    });

    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/input file/i);
  });

  test('evaluate refuses a directory as an @file payload', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: root,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: '@.',
    });

    expect(result.code).toBe(1);
  });

  test('validate refuses an absolute @file payload', async () => {
    const result = await ccepCommand({
      subcommand: 'validate',
      projectRoot: root,
      output: 'json',
      command: 'feature',
      input: `@${join(outside, 'planner.json')}`,
    });

    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/input file/i);
  });

  test('inline JSON payloads are unaffected by containment', async () => {
    const result = await ccepCommand({
      subcommand: 'evaluate',
      projectRoot: root,
      output: 'json',
      command: 'feature',
      userRequest: 'Add loyalty benefits',
      input: JSON.stringify(planner()),
    });

    expect(result.code).toBe(0);
  });

  describe('--context', () => {
    /** A real resolved context, so compile/evaluate accept the fixture. */
    async function writeContextFixture(dir: string, name: string): Promise<void> {
      const resolved = await ccepCommand({
        subcommand: 'resolve',
        projectRoot: root,
        output: 'json',
        command: 'feature',
        userRequest: 'Add loyalty benefits',
      });
      const { context } = resolved.data as { context: unknown };
      await writeFile(join(dir, name), JSON.stringify(context), 'utf-8');
    }

    test('compile reads a contained --context file', async () => {
      await writeContextFixture(root, 'context.json');

      const result = await ccepCommand({
        subcommand: 'compile',
        projectRoot: root,
        output: 'json',
        command: 'feature',
        phase: 'intake',
        contextPath: 'context.json',
      });

      expect(result.code).toBe(0);
    });

    test('compile refuses an absolute --context path', async () => {
      await writeContextFixture(outside, 'context.json');

      const result = await ccepCommand({
        subcommand: 'compile',
        projectRoot: root,
        output: 'json',
        command: 'feature',
        phase: 'intake',
        contextPath: join(outside, 'context.json'),
      });

      expect(result.code).toBe(1);
      expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/context/i);
    });

    test('compile refuses a traversing --context path', async () => {
      await writeContextFixture(outside, 'context.json');

      const result = await ccepCommand({
        subcommand: 'compile',
        projectRoot: root,
        output: 'json',
        command: 'feature',
        phase: 'intake',
        contextPath: `../${basename(outside)}/context.json`,
      });

      expect(result.code).toBe(1);
      expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/context/i);
    });

    test('compile refuses a --context path reached through a symlink', async () => {
      await writeContextFixture(outside, 'context.json');
      const created = await trySymlink(join(outside, 'context.json'), join(root, 'linked.json'));
      if (!created) return;

      const result = await ccepCommand({
        subcommand: 'compile',
        projectRoot: root,
        output: 'json',
        command: 'feature',
        phase: 'intake',
        contextPath: 'linked.json',
      });

      expect(result.code).toBe(1);
      expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/context/i);
    });

    test('evaluate refuses an absolute --context path', async () => {
      await writeContextFixture(outside, 'context.json');

      const result = await ccepCommand({
        subcommand: 'evaluate',
        projectRoot: root,
        output: 'json',
        command: 'feature',
        input: JSON.stringify(planner()),
        contextPath: join(outside, 'context.json'),
      });

      expect(result.code).toBe(1);
      expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(/context/i);
    });

    test('evaluate reads a contained --context file', async () => {
      await writeContextFixture(root, 'context.json');

      const result = await ccepCommand({
        subcommand: 'evaluate',
        projectRoot: root,
        output: 'json',
        command: 'feature',
        input: JSON.stringify(planner()),
        contextPath: 'context.json',
      });

      expect(result.code).toBe(0);
    });
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
