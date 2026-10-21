import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../src/cli/router';
import {
  castBallot,
  clearBallots,
  listBallots,
  tallyBallots,
} from '../../src/core/council/ballot-box';

function ballot(agentId: string, status: 'APPROVED' | 'REJECTED' | 'ABSTAIN' = 'APPROVED', extra: Record<string, unknown> = {}) {
  return {
    agentId,
    agentRole: 'reviewer',
    status,
    securityVeto: false,
    confidence: 0.9,
    findings: [],
    summary: `${agentId} votes ${status}`,
    ...extra,
  };
}

describe('council ballot bus', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-ballot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('cast stores ballots and re-votes replace by agent', async () => {
    expect((await castBallot(dir, ballot('a1'))).data).toMatchObject({ agentId: 'a1', boxSize: 1 });
    expect((await castBallot(dir, ballot('a2'))).data).toMatchObject({ boxSize: 2 });
    const revote = await castBallot(dir, ballot('a1', 'REJECTED'));
    expect(revote.data).toMatchObject({ boxSize: 2 });
    const listed = await listBallots(dir);
    expect(listed.data?.find((b) => b.agentId === 'a1')?.status).toBe('REJECTED');
  });

  test('cast rejects invalid ballots without touching the box', async () => {
    await castBallot(dir, ballot('a1'));
    const bad = await castBallot(dir, { agentId: 'x' });
    expect(bad.success).toBe(false);
    expect((await listBallots(dir)).data).toHaveLength(1);
  });

  test('tally computes consensus, consumes the box and logs the verdict', async () => {
    await castBallot(dir, ballot('a1'));
    await castBallot(dir, ballot('a2'));
    await castBallot(dir, ballot('a3'));
    const tally = await tallyBallots(dir);
    expect(tally.success && tally.data.status).toBe('APPROVED');
    expect((await listBallots(dir)).data).toHaveLength(0);
    const log = await readFile(join(dir, '.codeconductor', 'council', 'verdicts.jsonl'), 'utf-8');
    const lines = log.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).verdict.status).toBe('APPROVED');
  });

  test('tally honors a security veto through the bus', async () => {
    await castBallot(dir, ballot('a1'));
    await castBallot(dir, ballot('a2'));
    await castBallot(dir, ballot('security-1', 'REJECTED', { agentRole: 'security', securityVeto: true }));
    const tally = await tallyBallots(dir);
    expect(tally.success && tally.data.status).toBe('REJECTED');
    expect(tally.success && tally.data.vetoApplied).toBe(true);
  });

  test('tally on an empty box errors', async () => {
    expect((await tallyBallots(dir)).success).toBe(false);
  });

  test('clear empties the box and reports the count', async () => {
    await castBallot(dir, ballot('a1'));
    expect((await clearBallots(dir)).data).toEqual({ cleared: 1 });
    expect((await listBallots(dir)).data).toHaveLength(0);
  });

  test('corrupt box fails loudly instead of dropping votes', async () => {
    await mkdir(join(dir, '.codeconductor', 'council'), { recursive: true });
    await writeFile(join(dir, '.codeconductor', 'council', 'ballots.json'), '{nope');
    expect((await castBallot(dir, ballot('a1'))).success).toBe(false);
    expect((await tallyBallots(dir)).success).toBe(false);
  });

  test('ccep ballot cast/tally round-trips through the CLI', async () => {
    const route = (argv: string[]) => routeCommand(parseArgs(argv), dir);
    await writeFile(join(dir, 'b1.json'), JSON.stringify(ballot('a1')));
    await writeFile(join(dir, 'b2.json'), JSON.stringify(ballot('a2')));
    await writeFile(join(dir, 'b3.json'), JSON.stringify(ballot('a3')));
    const cast1 = await route(['ccep', 'ballot', 'cast', '--input', '@b1.json', '--output=json']);
    expect(cast1.code).toBe(0);
    expect(cast1.data).toMatchObject({ agentId: 'a1', boxSize: 1 });
    await route(['ccep', 'ballot', 'cast', '--input', '@b2.json', '--output=json']);
    await route(['ccep', 'ballot', 'cast', '--input', '@b3.json', '--output=json']);
    const tally = await route(['ccep', 'ballot', 'tally', '--output=json']);
    expect(tally.code).toBe(0);
    expect(tally.data).toMatchObject({ verdict: { status: 'APPROVED' } });
  });

  test('ccep ballot rejects unknown actions', async () => {
    const result = await routeCommand(parseArgs(['ccep', 'ballot', 'stuff']), dir);
    expect(result.code).toBe(1);
  });
});
