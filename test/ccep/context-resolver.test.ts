import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseCommand } from '../../src/core/ccep/command-parser';
import { resolveContext } from '../../src/core/ccep/context-resolver';
import { loadWorkflowProfile } from '../../src/core/ccep/workflow-profile-loader';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');

describe('ccep context-resolver', () => {
  test('merges envelope, profile, and project metadata', async () => {
    const envelope = parseCommand('feature', 'Add benefits CRUD', PROJECT_ROOT);
    const profile = loadWorkflowProfile('feature');
    const context = await resolveContext(envelope, profile, PROJECT_ROOT);

    expect(context.envelope.command).toBe('feature');
    expect(context.profile.id).toBe('feature');
    expect(context.intent.type).toBe('feature');
    expect(context.intent.goal).toBe('Add benefits CRUD');
    expect(context.project.rootDir).toBe(PROJECT_ROOT);
    expect(context.ast.source).toMatch(/detect|graphify|manual|product-graph/);
    expect(context.outputSchema).toBe(profile.phases[0]?.outputSchema);

    if (context.ast.source === 'product-graph') {
      expect(context.knowledge).toBeDefined();
      expect(typeof context.knowledge.nodeCount === 'number' || Object.keys(context.knowledge).length === 0).toBe(true);
    }
  });

  test('derives intent from explicit command — not from user request keywords', async () => {
    const ambiguous = 'fix the feature flag regression';

    const fixContext = await resolveContext(
      parseCommand('fix', ambiguous, PROJECT_ROOT),
      loadWorkflowProfile('fix'),
      PROJECT_ROOT,
    );
    const featureContext = await resolveContext(
      parseCommand('feature', ambiguous, PROJECT_ROOT),
      loadWorkflowProfile('feature'),
      PROJECT_ROOT,
    );

    expect(fixContext.intent.type).toBe('fix');
    expect(featureContext.intent.type).toBe('feature');
  });

  test('reads project name from package.json when present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ccep-context-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'loyalty-api' }));

    const envelope = parseCommand('council', 'Add audit trail', dir);
    const context = await resolveContext(envelope, loadWorkflowProfile('council'), dir);

    expect(context.project.name).toBe('loyalty-api');
  });
});
