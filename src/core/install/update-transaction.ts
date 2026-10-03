import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { resolveOutputWithinRoot } from '../filesystem/path-containment';

interface Snapshot {
  readonly path: string;
  readonly existed: boolean;
  readonly content?: Uint8Array;
}

function assertInsideBase(basePath: string, destination: string): string {
  const base = resolve(basePath);
  const absolute = resolve(base, destination);
  const rel = relative(base, absolute);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Update destination escapes the base path: ${destination}`);
  }
  return rel;
}

/**
 * Small filesystem transaction for the updater. It intentionally snapshots only
 * planned destinations, keeping user-created files outside the update scope.
 * Every destination must live inside the base path, so backups, restores and
 * removals can never reach outside it — and every rollback path is re-resolved
 * through containment to defeat symlink swaps planted after begin().
 */
export class UpdateTransaction {
  private readonly snapshots: Snapshot[];
  private readonly backupDir: string;
  private readonly basePath: string;

  private constructor(snapshots: Snapshot[], backupDir: string, basePath: string) {
    this.snapshots = snapshots;
    this.backupDir = backupDir;
    this.basePath = basePath;
  }

  static async begin(basePath: string, destinations: readonly string[]): Promise<UpdateTransaction> {
    const unique = [...new Set(destinations)];
    for (const destination of unique) {
      assertInsideBase(basePath, destination);
    }
    const backupDir = resolve(basePath, '.codeconductor', 'backups', `update-${Date.now()}`);
    await mkdir(backupDir, { recursive: true });
    const snapshots: Snapshot[] = [];
    for (const destination of unique) {
      try {
        const content = await readFile(destination);
        snapshots.push({ path: destination, existed: true, content });
        const backupPath = join(backupDir, relative(resolve(basePath), resolve(destination)));
        await mkdir(dirname(backupPath), { recursive: true });
        await writeFile(backupPath, content);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          snapshots.push({ path: destination, existed: false });
        } else {
          throw error;
        }
      }
    }
    return new UpdateTransaction(snapshots, backupDir, basePath);
  }

  async rollback(): Promise<void> {
    for (const snapshot of this.snapshots) {
      const rel = assertInsideBase(this.basePath, snapshot.path);
      const gated = await resolveOutputWithinRoot(this.basePath, rel);
      if (gated === undefined) {
        throw new Error(`Rollback destination is no longer contained: ${snapshot.path}`);
      }
      if (snapshot.existed) {
        await mkdir(dirname(gated), { recursive: true });
        await writeFile(gated, snapshot.content!);
      } else {
        await unlink(gated).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    }
    await rm(this.backupDir, { recursive: true, force: true });
  }

  async commit(): Promise<void> {
    await rm(this.backupDir, { recursive: true, force: true });
  }
}
