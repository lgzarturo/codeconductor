/**
 * Council ballot bus — file-locked ballot box over plain JSON.
 *
 * Agents cast individual verdicts concurrently; the queue lock serializes
 * writes. Tally runs the consensus engine, appends the verdict to the audit
 * log, and consumes the box. A corrupt box fails loudly instead of dropping
 * votes.
 */

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  councilConsensus,
  type ConsensusConfig,
  type CouncilVerdict,
  type CouncilVerdictInput,
} from '../../domain/council/council-consensus';
import { CouncilVerdictInputSchema } from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';
import { withQueueLock } from '../queue/lock';

const BOX_FILE = '.codeconductor/council/ballots.json';
const VERDICTS_LOG = '.codeconductor/council/verdicts.jsonl';

async function readBox(projectRoot: string): Promise<Result<CouncilVerdictInput[], Error>> {
  let raw: string;
  try {
    raw = await readFile(resolve(projectRoot, BOX_FILE), 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ok([]);
    return err(e instanceof Error ? e : new Error(String(e)));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(new Error('Ballot box is corrupt: invalid JSON'));
  }
  if (!Array.isArray(parsed)) {
    return err(new Error('Ballot box is corrupt: expected a JSON array'));
  }
  const ballots: CouncilVerdictInput[] = [];
  for (const [index, entry] of parsed.entries()) {
    const validated = CouncilVerdictInputSchema.safeParse(entry);
    if (!validated.success) {
      return err(new Error(`Ballot box is corrupt at index ${index}`));
    }
    ballots.push(validated.data);
  }
  return ok(ballots);
}

async function writeBox(
  projectRoot: string,
  ballots: readonly CouncilVerdictInput[],
): Promise<Result<void, Error>> {
  const dir = resolve(projectRoot, '.codeconductor/council');
  const temporary = resolve(dir, `ballots.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(temporary, JSON.stringify(ballots, null, 2), { encoding: 'utf-8', flag: 'wx' });
    await rename(temporary, resolve(projectRoot, BOX_FILE));
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  } finally {
    await unlink(temporary).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
}

export async function castBallot(
  projectRoot: string,
  ballot: unknown,
): Promise<Result<{ agentId: string; boxSize: number }, Error>> {
  return withQueueLock(projectRoot, async () => {
    const validated = CouncilVerdictInputSchema.safeParse(ballot);
    if (!validated.success) {
      const first = validated.error.issues[0];
      const where = first && first.path.length > 0 ? ` at ${first.path.join('.')}` : '';
      return err(new Error(`Invalid ballot${where}: ${first?.message ?? 'rejected'}`));
    }
    const box = await readBox(projectRoot);
    if (!box.success) return box;
    const next = [...box.data.filter((b) => b.agentId !== validated.data.agentId), validated.data];
    const written = await writeBox(projectRoot, next);
    if (!written.success) return written;
    return ok({ agentId: validated.data.agentId, boxSize: next.length });
  });
}

export async function listBallots(
  projectRoot: string,
): Promise<Result<CouncilVerdictInput[], Error>> {
  return readBox(projectRoot);
}

export async function tallyBallots(
  projectRoot: string,
  config?: ConsensusConfig,
): Promise<Result<CouncilVerdict, Error>> {
  return withQueueLock(projectRoot, async () => {
    const box = await readBox(projectRoot);
    if (!box.success) return box;
    if (box.data.length === 0) {
      return err(new Error('No ballots cast'));
    }
    const verdict: CouncilVerdict = councilConsensus(box.data, config);
    try {
      const dir = resolve(projectRoot, '.codeconductor/council');
      await mkdir(dir, { recursive: true });
      await appendFile(
        resolve(projectRoot, VERDICTS_LOG),
        `${JSON.stringify({ at: new Date().toISOString(), verdict })}\n`,
        'utf-8',
      );
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
    const cleared = await writeBox(projectRoot, []);
    if (!cleared.success) return cleared;
    return ok(verdict);
  });
}

export async function clearBallots(
  projectRoot: string,
): Promise<Result<{ cleared: number }, Error>> {
  return withQueueLock(projectRoot, async () => {
    const box = await readBox(projectRoot);
    if (!box.success) return box;
    const cleared = await writeBox(projectRoot, []);
    if (!cleared.success) return cleared;
    return ok({ cleared: box.data.length });
  });
}
