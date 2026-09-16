import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

export interface ManagedFileState {
  readonly installedHash: string;
  readonly sourceVersion: string;
  readonly strategy?: string;
}

export interface InstallationState {
  readonly schemaVersion: 1;
  readonly harnessVersion: string;
  readonly cliVersion: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly targets: Record<string, { version: string }>;
  readonly managedFiles: Record<string, ManagedFileState>;
}

export type ManagedFileStatus = 'unknown' | 'missing' | 'unchanged' | 'modified';

const STATE_RELATIVE_PATH = '.codeconductor/install-state.json';

export function installationStatePath(basePath: string): string {
  return resolve(basePath, STATE_RELATIVE_PATH);
}

export function sha256(content: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export async function readInstallationState(basePath: string): Promise<InstallationState | null> {
  try {
    const value = JSON.parse(await readFile(installationStatePath(basePath), 'utf-8')) as InstallationState;
    if (value.schemaVersion !== 1 || !value.managedFiles) return null;
    return value;
  } catch {
    return null;
  }
}

export async function getManagedFileStatus(
  basePath: string,
  absolutePath: string,
  state: InstallationState,
): Promise<ManagedFileStatus> {
  const key = relative(basePath, absolutePath);
  const record = state.managedFiles[key];
  if (!record) return 'unknown';
  try {
    return sha256(await readFile(absolutePath)) === record.installedHash ? 'unchanged' : 'modified';
  } catch {
    return 'missing';
  }
}

export async function recordManagedFiles(
  basePath: string,
  absolutePaths: readonly string[],
  options: { readonly cliVersion: string; readonly target?: string; readonly strategy?: string },
): Promise<InstallationState> {
  const previous = await readInstallationState(basePath);
  const now = new Date().toISOString();
  const managedFiles = { ...(previous?.managedFiles ?? {}) };

  for (const absolutePath of absolutePaths) {
    try {
      managedFiles[relative(basePath, absolutePath)] = {
        installedHash: sha256(await readFile(absolutePath)),
        sourceVersion: options.cliVersion,
        ...(options.strategy ? { strategy: options.strategy } : {}),
      };
    } catch {
      // A skipped or failed write has no trustworthy baseline to record.
    }
  }

  const state: InstallationState = {
    schemaVersion: 1,
    harnessVersion: options.cliVersion,
    cliVersion: options.cliVersion,
    installedAt: previous?.installedAt ?? now,
    updatedAt: now,
    targets: {
      ...(previous?.targets ?? {}),
      ...(options.target ? { [options.target]: { version: options.cliVersion } } : {}),
    },
    managedFiles,
  };
  const destination = installationStatePath(basePath);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  await rename(temporary, destination);
  return state;
}
