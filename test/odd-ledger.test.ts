import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { oddCommand } from '../src/commands/odd.command';
import { loadWorkflowProfile } from '../src/core/ccep/workflow-profile-loader';

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cc-odd-ledger-'));
  roots.push(root);
  return root;
}

function request(route: 'read-only' | 'small' | 'tracked' = 'tracked') {
  return {
    id: 'delivery-001',
    authorized: route !== 'read-only',
    route,
    taskCard: {
      id: 'delivery-001',
      title: 'Add ledger',
      objective: 'Persist a recoverable delivery record',
      context: 'BC-021',
      acceptanceCriteria: ['Ledger is recoverable'],
      risk: 'medium',
      targetFiles: ['README.md'],
      agentType: 'implementer',
      evidenceRequired: ['bun test'],
      status: 'ready',
      type: 'feature',
      boundaries: ['No external services'],
      requiresTests: true,
    },
    tasks: [{ id: 'implement', title: 'Implement ledger', status: 'pending' }],
    nextStep: 'Implement the ledger.',
  };
}

describe('ODD Delivery Ledger', () => {
  test('does not create a ledger for read-only or small routes', async () => {
    const root = await projectRoot();

    for (const route of ['read-only', 'small'] as const) {
      const result = await oddCommand({ subcommand: 'create', projectRoot: root, input: request(route) });
      expect(result.code).toBe(0);
      expect(result.data).toMatchObject({ created: false, reason: 'route_not_tracked' });
    }
  });

  test('creates one validated ledger for authorized tracked delivery and reads it back', async () => {
    const root = await projectRoot();
    const created = await oddCommand({ subcommand: 'create', projectRoot: root, input: request() });
    expect(created.code).toBe(0);
    expect(created.data).toMatchObject({ created: true, ledger: { id: 'delivery-001' } });

    const repeat = await oddCommand({ subcommand: 'create', projectRoot: root, input: request() });
    expect(repeat.code).toBe(0);
    expect(repeat.data).toMatchObject({ created: false, existing: true });

    const loaded = await oddCommand({ subcommand: 'read', projectRoot: root, id: 'delivery-001' });
    expect(loaded.code).toBe(0);
    expect(loaded.data).toMatchObject({ ledger: { nextStep: 'Implement the ledger.' } });
  });

  test('reconcile reports unavailable optional memory without overwriting the ledger', async () => {
    const root = await projectRoot();
    await oddCommand({ subcommand: 'create', projectRoot: root, input: request() });

    const result = await oddCommand({ subcommand: 'reconcile', projectRoot: root, id: 'delivery-001' });
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({ status: 'ready', memory: 'unavailable' });
  });

  test('reconcile reports workspace divergence without overwriting the ledger', async () => {
    const root = await projectRoot();
    await writeFile(join(root, 'README.md'), 'before');
    await oddCommand({ subcommand: 'create', projectRoot: root, input: request() });
    await writeFile(join(root, 'README.md'), 'after');

    const result = await oddCommand({ subcommand: 'reconcile', projectRoot: root, id: 'delivery-001' });
    expect(result.data).toMatchObject({
      status: 'conflict',
      changedPaths: ['README.md'],
      resume: { status: 'needs_decision', changedPaths: ['README.md'] },
    });

    const loaded = await oddCommand({ subcommand: 'read', projectRoot: root, id: 'delivery-001' });
    expect(loaded.data).toMatchObject({ ledger: { workspace: { 'README.md': expect.any(String) } } });
  });

  test('registers an opt-in CCEP profile with the existing confirmation gate', () => {
    const profile = loadWorkflowProfile('odd', process.cwd());
    expect(profile.command).toBe('odd');
    expect(profile.confirmationGate).toEqual({ stopOnHighRisk: true, stopOnQuestions: true });
  });
});
