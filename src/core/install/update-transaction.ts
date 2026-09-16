import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

interface Snapshot {
  readonly path: string;
  readonly existed: boolean;
  readonly content?: Uint8Array;
}

/**
 * Small filesystem transaction for the updater. It intentionally snapshots only
 * planned destinations, keeping user-created files outside the update scope.
 */
export class UpdateTransaction {
  private readonly snapshots: Snapshot[];
  private readonly backupDir: string;

  private constructor(snapshots: Snapshot[], backupDir: string) {
    this.snapshots = snapshots;
    this.backupDir = backupDir;
  }

  static async begin(basePath: string, destinations: readonly string[]): Promise<UpdateTransaction> {
    const unique = [...new Set(destinations)];
    const backupDir = resolve(basePath, '.codeconductor', 'backups', `update-${Date.now()}`);
    await mkdir(backupDir, { recursive: true });
    const snapshots: Snapshot[] = [];
    for (const destination of unique) {
      try {
        const content = await readFile(destination);
        snapshots.push({ path: destination, existed: true, content });
        const backupPath = join(backupDir, relative(basePath, destination));
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
    return new UpdateTransaction(snapshots, backupDir);
  }

  async rollback(): Promise<void> {
    for (const snapshot of this.snapshots) {
      if (snapshot.existed) {
        await mkdir(dirname(snapshot.path), { recursive: true });
        await writeFile(snapshot.path, snapshot.content!);
      } else {
        await unlink(snapshot.path).catch((error: NodeJS.ErrnoException) => {
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
