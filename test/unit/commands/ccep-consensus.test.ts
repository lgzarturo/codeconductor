import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ccepCommand } from '../../../src/commands/ccep.command';

function ballot(
  agentId: string,
  status: 'APPROVED' | 'REJECTED' | 'ABSTAIN' = 'APPROVED',
  extra: Record<string, unknown> = {},
) {
  return {
    agentId,
    agentRole: agentId,
    status,
    securityVeto: false,
    confidence: 1,
    findings: [],
    summary: `${agentId} ${status}`,
    ...extra,
  };
}

let ROOT: string;

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'ccep-consensus-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('ccep consensus', () => {
  test('APPROVED majority exits 0', async () => {
    await writeFile(
      join(ROOT, 'verdicts.json'),
      JSON.stringify([ballot('a'), ballot('b'), ballot('c')]),
    );
    const result = await ccepCommand({
      subcommand: 'consensus',
      projectRoot: ROOT,
      output: 'json',
      input: '@verdicts.json',
    });
    expect(result.code).toBe(0);
    expect((result.data as { verdict: { status: string } }).verdict.status).toBe('APPROVED');
  });

  test('security veto exits 1 (REJECTED)', async () => {
    const result = await ccepCommand({
      subcommand: 'consensus',
      projectRoot: ROOT,
      output: 'json',
      input: JSON.stringify([
        ballot('architect'),
        ballot('product'),
        ballot('security', 'REJECTED', { securityVeto: true }),
      ]),
    });
    expect(result.code).toBe(1);
    expect((result.data as { verdict: { status: string } }).verdict.status).toBe('REJECTED');
  });

  test('quorum failure exits 2 (ESCALATED)', async () => {
    const result = await ccepCommand({
      subcommand: 'consensus',
      projectRoot: ROOT,
      output: 'json',
      input: JSON.stringify([ballot('solo')]),
    });
    expect(result.code).toBe(2);
    expect((result.data as { verdict: { status: string } }).verdict.status).toBe('ESCALATED');
  });

  test('rejects a payload that is not a ballot box', async () => {
    const result = await ccepCommand({
      subcommand: 'consensus',
      projectRoot: ROOT,
      output: 'json',
      input: JSON.stringify({ status: 'APPROVED' }),
    });
    expect(result.code).toBe(1);
    expect((result.data as { success: boolean }).success).toBe(false);
  });
});
