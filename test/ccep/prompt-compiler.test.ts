import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { parseCommand } from '../../src/core/ccep/command-parser';
import { resolveContext } from '../../src/core/ccep/context-resolver';
import { loadWorkflowProfile } from '../../src/core/ccep/workflow-profile-loader';
import { compilePrompt } from '../../src/core/ccep/prompt-compiler';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');

describe('ccep prompt-compiler', () => {
  test('assembles seven prompt layers for planner phase', async () => {
    const envelope = parseCommand('feature', 'CRUD for loyalty benefits', PROJECT_ROOT);
    const profile = loadWorkflowProfile('feature');
    const context = await resolveContext(envelope, profile, PROJECT_ROOT);
    const phase = profile.phases[0]!;

    const compiled = compilePrompt({
      role: phase.agent,
      phase: phase.id,
      context,
      promptVersion: 'v1.0.0',
    });

    expect(compiled.layers).toHaveLength(7);
    expect(compiled.layers.map((l) => l.name)).toEqual([
      'system',
      'agent',
      'policies',
      'knowledge',
      'ast',
      'task',
      'output_schema',
    ]);
    expect(compiled.prompt).toContain('Planner');
    expect(compiled.prompt).toContain('"goal"');
    expect(compiled.prompt).not.toContain('ayúdame a pensar');
  });

  test('produces different task layers for different commands with same user text', async () => {
    const userRequest = 'improve the benefits module';

    const featureCtx = await resolveContext(
      parseCommand('feature', userRequest, PROJECT_ROOT),
      loadWorkflowProfile('feature'),
      PROJECT_ROOT,
    );
    const fixCtx = await resolveContext(
      parseCommand('fix', userRequest, PROJECT_ROOT),
      loadWorkflowProfile('fix'),
      PROJECT_ROOT,
    );

    const featurePrompt = compilePrompt({
      role: 'task-coach',
      phase: 'intake',
      context: featureCtx,
      promptVersion: 'v1.0.0',
    });
    const fixPrompt = compilePrompt({
      role: 'task-coach',
      phase: 'intake',
      context: fixCtx,
      promptVersion: 'v1.0.0',
    });

    expect(featurePrompt.layers.find((l) => l.name === 'task')?.content).toContain('feature');
    expect(fixPrompt.layers.find((l) => l.name === 'task')?.content).toContain('fix');
    expect(featurePrompt.prompt).not.toBe(fixPrompt.prompt);
  });

  test('embeds output schema for the active phase', async () => {
    const envelope = parseCommand('council', 'Add OAuth2 login', PROJECT_ROOT);
    const profile = loadWorkflowProfile('council');
    const context = await resolveContext(envelope, profile, PROJECT_ROOT);

    const compiled = compilePrompt({
      role: 'task-coach',
      phase: 'deliberation',
      context,
      promptVersion: 'v1.0.0',
    });

    const schemaLayer = compiled.layers.find((l) => l.name === 'output_schema');
    expect(schemaLayer?.content).toContain('planner-output');
    expect(schemaLayer?.content).toContain('questionsForUser');
  });
});
