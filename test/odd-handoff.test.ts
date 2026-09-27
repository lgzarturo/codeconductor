import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { oddCommand } from '../src/commands/odd.command';
import { buildHandoffEnvelope } from '../src/core/ccep/handoff-envelope';
import type { DeliveryLedgerInput } from '../src/validation/schemas';

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cc-odd-handoff-'));
  roots.push(root);
  return root;
}

function request() {
  return {
    id: 'delivery-002',
    authorized: true,
    route: 'tracked' as const,
    taskCard: {
      id: 'delivery-002',
      title: 'Preserve a compact handoff',
      objective: 'Resume work from canonical artifacts without a transcript',
      context: 'private session detail that must not enter the handoff',
      acceptanceCriteria: ['A subsequent agent has the task, scope, evidence, and next action'],
      risk: 'medium' as const,
      targetFiles: ['src/core/ccep/context-assembly.ts'],
      agentType: 'implementer',
      evidenceRequired: ['bun test test/odd-handoff.test.ts'],
      status: 'in-progress' as const,
      type: 'feature' as const,
      boundaries: ['No transcript forwarding'],
      constraints: ['No new service'],
      requiresTests: true,
    },
    tasks: [
      { id: 'implement', title: 'Implement envelope', status: 'pending' as const },
      { id: 'review', title: 'Review envelope', status: 'blocked' as const },
    ],
    nextStep: 'Run the focused handoff tests.',
    technicalPlanPath: 'docs/plans/delivery-002.md',
  };
}

describe('ODD artifact handoff', () => {
  test('derives a minimal envelope from the Delivery Ledger without task context', async () => {
    const root = await projectRoot();
    const created = await oddCommand({ subcommand: 'create', projectRoot: root, input: request() });
    expect(created.code).toBe(0);
    const ledger = (created.data as { ledger: DeliveryLedgerInput }).ledger;

    const handoff = buildHandoffEnvelope(ledger, []);

    expect(handoff).toEqual({
      version: 1,
      task: {
        id: 'delivery-002',
        objective: 'Resume work from canonical artifacts without a transcript',
        acceptanceCriteria: ['A subsequent agent has the task, scope, evidence, and next action'],
        status: 'in-progress',
      },
      decisions: {
        constraints: ['No new service'],
        unresolved: ['Review envelope'],
      },
      scope: {
        relevantFiles: ['src/core/ccep/context-assembly.ts'],
        boundaries: ['No transcript forwarding'],
      },
      verification: {
        evidence: ['bun test test/odd-handoff.test.ts'],
      },
      change: { touchedFiles: [] },
      next: {
        role: 'implementer',
        objective: 'Run the focused handoff tests.',
      },
      sources: {
        deliveryLedger: 'delivery-002',
        memoryTopicKey: 'delivery:delivery-002',
        technicalPlanPath: 'docs/plans/delivery-002.md',
      },
    });
    expect(JSON.stringify(handoff)).not.toContain('private session detail');
  });

  test('returns the derived handoff and current workspace divergence without returning the ledger', async () => {
    const root = await projectRoot();
    await writeFile(join(root, 'src-core-ccep-context-assembly.ts'), 'before');
    const input = request();
    input.taskCard.targetFiles = ['src-core-ccep-context-assembly.ts'];
    await oddCommand({ subcommand: 'create', projectRoot: root, input });
    await writeFile(join(root, 'src-core-ccep-context-assembly.ts'), 'after');

    const result = await oddCommand({ subcommand: 'handoff', projectRoot: root, id: 'delivery-002' });

    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({
      success: true,
      status: 'conflict',
      changedPaths: ['src-core-ccep-context-assembly.ts'],
      resume: { status: 'needs_decision' },
      handoff: {
        change: { touchedFiles: ['src-core-ccep-context-assembly.ts'] },
        next: { objective: 'Run the focused handoff tests.' },
      },
    });
    expect(result.data).not.toHaveProperty('ledger');
  });
});
