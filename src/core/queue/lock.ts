import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { appendEvent } from '../memory/episodic-store';
import { err, type Result } from '../../utils/result';

interface LockOwner {
  pid: number;
  hostname: string;
  timestamp: string;
  token: string;
}

const STALE_MS = 5 * 60 * 1000;
const heldLocks = new AsyncLocalStorage<ReadonlySet<string>>();

async function readOwner(path: string): Promise<LockOwner> {
  const owner = JSON.parse(await readFile(path, 'utf8')) as LockOwner;
  if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.hostname !== 'string'
    || typeof owner.token !== 'string' || !owner.token || !Number.isFinite(Date.parse(owner.timestamp))) {
    throw new Error('Invalid queue lock metadata');
  }
  return owner;
}

function isOrphan(owner: LockOwner): boolean {
  if (owner.hostname !== hostname() || Date.now() - Date.parse(owner.timestamp) < STALE_MS) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

async function removeOwned(path: string, token: string): Promise<void> {
  try {
    if ((await readOwner(path)).token === token) await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

/** Append-only election records prevent a delayed reclaimer removing a newer guard. */
async function electRecovery(dir: string, token: string, owner: LockOwner): Promise<boolean> {
  const registry = resolve(dir, 'recoveries');
  await mkdir(registry, { recursive: true });
  const seen = new Set<string>();
  while (!seen.has(token)) {
    seen.add(token);
    const path = resolve(registry, `${createHash('sha256').update(token).digest('hex')}.json`);
    try {
      const file = await open(path, 'wx');
      try { await file.writeFile(JSON.stringify(owner)); } finally { await file.close(); }
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    const elected = await readOwner(path);
    if (elected.token === owner.token) return true;
    if (!isOrphan(elected)) return false;
    // Keep the interrupted election intact; elect exactly one successor instead.
    token = elected.token;
  }
  throw new Error('Invalid queue lock recovery chain');
}

/** Serialize each full goal transition, including its operational state and rollback. */
export async function withQueueLock<T>(
  projectRoot: string,
  action: () => Promise<Result<T, Error>>,
): Promise<Result<T, Error>> {
  const root = resolve(projectRoot);
  const held = heldLocks.getStore();
  if (held?.has(root)) return action();
  const dir = resolve(projectRoot, '.codeconductor/queue');
  const path = resolve(dir, '.lock');
  const recoveryPath = resolve(dir, '.lock.recovery');
  const owner: LockOwner = {
    pid: process.pid, hostname: hostname(), timestamp: new Date().toISOString(), token: randomUUID(),
  };
  let acquired = false;
  try {
    await mkdir(dir, { recursive: true });
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        // Compatibility with markers left by an interrupted older version.
        // This version never creates reusable recovery markers.
        const recoveryOwner = await readOwner(recoveryPath);
        if (isOrphan(recoveryOwner) && await electRecovery(dir, recoveryOwner.token, owner)) {
          await removeOwned(recoveryPath, recoveryOwner.token);
          continue;
        }
      } catch (e) {
        if (e instanceof SyntaxError || (e instanceof Error && e.message === 'Invalid queue lock metadata')) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 25));
          continue;
        }
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        try {
          const file = await open(path, 'wx');
          try { await file.writeFile(JSON.stringify(owner)); } finally { await file.close(); }
          acquired = true;
          break;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
        try {
          const existing = await readOwner(path);
          if (isOrphan(existing) && await electRecovery(dir, existing.token, owner)) {
            const current = await readOwner(path);
            if (current.token === existing.token && isOrphan(current)) {
              await unlink(path);
              const recovered = await appendEvent(projectRoot, {
                type: 'lock.recovered', timestamp: new Date().toISOString(), payload: { owner: current },
              });
              if (!recovered.success) return recovered;
            }
            continue;
          }
        } catch (e) {
          // A competing owner may still be filling its exclusively created file.
          // Unreadable metadata never proves an orphan; wait rather than reclaim.
          if (!(e instanceof SyntaxError) && !(e instanceof Error && e.message === 'Invalid queue lock metadata')
            && !['ENOENT', 'EEXIST'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e;
        }
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
    if (!acquired) return err(new Error('Queue lock is held by another process; retry after it finishes'));
    return await heldLocks.run(new Set([...(held ?? []), root]), action);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  } finally {
    if (acquired) {
      try { await removeOwned(path, owner.token); } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }
}
