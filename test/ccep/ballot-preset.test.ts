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

function ballot(agentId: string, status: 'APPROVED' | 'REJECTED' | 'ABSTAIN' = 'APPROVED') {
  return {
    agentId,
    agentRole: 'reviewer',
    status,
    securityVeto: false,
    confidence: 0.9,
    findings: [],
    summary: `${agentId} votes ${status}`,
  };
}

const TRIO_PRESET = `name: trio
version: 0.1.0
description: Three-agent council
outputContract: v1
agents:
  - id: architect
    role: Architect
    context: repo-readonly
    modelHint: strong-reasoning
    focus:
      - architecture
  - id: delivery
    role: Delivery
    context: repo-readonly
    modelHint: practical-coding
    focus:
      - testing
  - id: security-reviewer
    role: Security Reviewer
    context: repo-readonly
    modelHint: security-reasoning
    focus:
      - security
`;

describe('council multi-preset routing', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-ballot-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('RED: preset boxes are isolated from the default box', async () => {
    expect((await castBallot(dir, ballot('a1'), 'trio')).data).toMatchObject({ boxSize: 1 });
    expect((await listBallots(dir)).data).toEqual([]);
    expect((await listBallots(dir, 'trio')).data).toMatchObject([{ agentId: 'a1' }]);
  });

  test('default preset keeps the legacy ballots.json path', async () => {
    await castBallot(dir, ballot('a1'));
    const raw = await readFile(join(dir, '.codeconductor/council/ballots.json'), 'utf-8');
    expect(JSON.parse(raw)).toMatchObject([{ agentId: 'a1' }]);
  });

  test('tally derives quorum from the preset roster', async () => {
    await mkdir(join(dir, '.codeconductor/presets'), { recursive: true });
    await writeFile(join(dir, '.codeconductor/presets/trio.yml'), TRIO_PRESET);
    await castBallot(dir, ballot('architect'), 'trio');
    await castBallot(dir, ballot('delivery'), 'trio');

    const tally = await tallyBallots(dir, undefined, 'trio');
    expect(tally.success).toBe(true);
    // Roster of 3 -> quorum 2 -> 2 approvals carry; default box needs 3.
    expect(tally.data?.status).toBe('APPROVED');
  });

  test('same ballots under the default box do not reach quorum', async () => {
    await castBallot(dir, ballot('a1'));
    await castBallot(dir, ballot('a2'));
    const tally = await tallyBallots(dir);
    expect(tally.success).toBe(true);
    expect(tally.data?.status).toBe('ESCALATED');
  });

  test('explicit config wins over the preset roster', async () => {
    await mkdir(join(dir, '.codeconductor/presets'), { recursive: true });
    await writeFile(join(dir, '.codeconductor/presets/trio.yml'), TRIO_PRESET);
    await castBallot(dir, ballot('architect'), 'trio');
    await castBallot(dir, ballot('delivery'), 'trio');

    const tally = await tallyBallots(dir, { algorithm: 'majority', allowSecurityVeto: true, quorum: 5 }, 'trio');
    expect(tally.success).toBe(true);
    expect(tally.data?.status).toBe('ESCALATED');
  });

  test('tally with an unknown preset fails closed', async () => {
    await castBallot(dir, ballot('a1'), 'trio');
    const tally = await tallyBallots(dir, undefined, 'trio');
    expect(tally.success).toBe(false);
  });

  test('invalid preset names are rejected without touching the filesystem', async () => {
    const casted = await castBallot(dir, ballot('a1'), '../escape');
    expect(casted.success).toBe(false);
    await expect(readFile(resolve(dir, '..', 'escape'), 'utf-8')).rejects.toThrow();
  });

  test('clear is scoped to its preset', async () => {
    await castBallot(dir, ballot('a1'));
    await castBallot(dir, ballot('a2'), 'trio');
    expect((await clearBallots(dir, 'trio')).data).toEqual({ cleared: 1 });
    expect((await listBallots(dir)).data).toMatchObject([{ agentId: 'a1' }]);
  });

  test('ccep ballot routes --preset through the CLI', async () => {
    const route = (argv: string[]) => routeCommand(parseArgs(argv), dir);
    await writeFile(join(dir, 'b1.json'), JSON.stringify(ballot('a1')));
    const casted = await route(['ccep', 'ballot', 'cast', '--input', '@b1.json', '--preset', 'trio', '--output=json']);
    expect(casted.code).toBe(0);
    const listed = await route(['ccep', 'ballot', 'list', '--preset', 'trio', '--output=json']);
    expect(listed.data).toMatchObject({ count: 1 });
    const listedDefault = await route(['ccep', 'ballot', 'list', '--output=json']);
    expect(listedDefault.data).toMatchObject({ count: 0 });
  });
});
