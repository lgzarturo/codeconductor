import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  runWorkflowPipeline,
  type PipelineCallbacks,
  type TaskCard,
  type TechnicalPlan,
} from '../../../../src/core/pipeline/workflow-loop';
import { TechnicalPlanOutputSchema } from '../../../../src/validation/schemas';
import { validateOutputForRole } from '../../../../src/core/ccep/output-validator';
import { parseCommand } from '../../../../src/core/ccep/command-parser';
import { loadWorkflowProfile } from '../../../../src/core/ccep/workflow-profile-loader';
import { resolveContext } from '../../../../src/core/ccep/context-resolver';
import { compilePrompt } from '../../../../src/core/ccep/prompt-compiler';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');

describe('technical-plan symbol boundaries', () => {
  test('RED: schema accepts symbolsAffected and defaults it to {}', () => {
    const parsed = TechnicalPlanOutputSchema.parse({
      approach: 'fix clamp',
      filesAffected: ['a.ts'],
      risks: [],
      edgeCases: [{ scenario: 's', input: 'i', expected: 'e' }],
      symbolsAffected: { 'a.ts': ['alpha'] },
    });
    expect(parsed.symbolsAffected).toEqual({ 'a.ts': ['alpha'] });

    const defaulted = TechnicalPlanOutputSchema.parse({
      approach: 'docs',
      filesAffected: [],
      risks: [],
      edgeCases: [{ scenario: 's', input: 'i', expected: 'e' }],
    });
    expect(defaulted.symbolsAffected).toEqual({});
  });

  test('validator accepts symbol boundaries and rejects non-string symbols', () => {
    const ok = validateOutputForRole('task-coach', 'technical-plan', {
      approach: 'fix clamp',
      filesAffected: ['a.ts'],
      risks: [],
      edgeCases: [{ scenario: 's', input: 'i', expected: 'e' }],
      symbolsAffected: { 'a.ts': ['alpha'] },
    });
    expect(ok.valid).toBe(true);

    const bad = validateOutputForRole('task-coach', 'technical-plan', {
      approach: 'fix clamp',
      filesAffected: ['a.ts'],
      risks: [],
      edgeCases: [{ scenario: 's', input: 'i', expected: 'e' }],
      symbolsAffected: { 'a.ts': [42] },
    });
    expect(bad.valid).toBe(false);
  });

  test('design prompt example shows the symbolsAffected contract', async () => {
    const envelope = parseCommand('feature', 'Add loyalty rewards', PROJECT_ROOT);
    const profile = loadWorkflowProfile('feature');
    const context = await resolveContext(envelope, profile, PROJECT_ROOT);
    const compiled = compilePrompt({ role: 'task-coach', phase: 'design', context, promptVersion: 'v1.0.0' });
    const schemaLayer = compiled.layers.find((layer) => layer.name === 'output_schema')?.content;
    expect(schemaLayer).toContain('symbolsAffected');
  });
});

describe('VALIDATE enforces plan symbol boundaries', () => {
  let dir: string;

  const A_TS = `export function alpha(): number {
  return 1;
}

export function beta(): number {
  return 2;
}
`;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cc-plan-symbols-'));
    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    await writeFile(join(dir, 'a.ts'), A_TS);
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: dir });
    // Second commit touches beta only; diff vs HEAD~1 exposes it.
    await writeFile(join(dir, 'a.ts'), A_TS.replace('return 2;', 'return 20;'));
    await execFileAsync('git', ['add', '.'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'touch beta'], { cwd: dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('RED: touching a symbol outside the plan boundary fails VALIDATE', async () => {
    const card: TaskCard = {
      title: 'Fix alpha',
      type: 'fix',
      risk: 'low',
      scope: { in: [], out: [] },
      context: 'ctx',
      acceptanceCriteria: ['ok'],
      constraints: [],
    };
    const plan: TechnicalPlan = {
      approach: 'touch alpha only',
      filesAffected: ['a.ts'],
      edgeCaseMatrix: [{ scenario: 's', expected: 'e' }],
      symbolsAffected: { 'a.ts': ['alpha'] },
    };
    const callbacks: PipelineCallbacks = {
      runIntake: async () => card,
      runStructure: async (c) => c,
      runDesign: async () => plan,
      runTest: async () => ({ testsWritten: 1, suiteFails: true }),
      runImplement: async () => ({ codeWritten: true, testsPass: true }),
      runValidate: async () => ({ mutationScore: 90, diffAuditPassed: true, survivingMutants: [] }),
      runCouncilReview: async () => [],
      runCompact: async () => {},
      onStopGate: async () => 'APPROVE',
    };
    const result = await runWorkflowPipeline('fix alpha', { callbacks, cwd: dir });
    expect(result.success).toBe(false);
    expect(result.phase).toBe('VALIDATE');
    expect(result.error).toContain('beta');
  });
});
