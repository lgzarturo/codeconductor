import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export type RddPhase = 'red' | 'green' | 'refactor' | 'verification' | 'mutation' | 'review';

export interface RddReceiptPath {
  readonly path: string;
  readonly hash: string;
}

export interface RddReceipt {
  readonly version: 1;
  readonly taskId: string;
  readonly phase: RddPhase;
  readonly paths: readonly RddReceiptPath[];
  readonly coverage: 'paths' | 'project';
  readonly manifestHash: string;
  readonly command?: string;
  readonly outcome: 'passed' | 'failed';
  readonly capturedAt: string;
}

export interface ReceiptVerification {
  readonly valid: boolean;
  readonly expectedHash: string;
  readonly actualHash: string;
  readonly changedPaths: readonly string[];
}

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.codeconductor',
  'node_modules',
  'dist',
  'coverage',
  'graphify-out',
]);

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function canonicalPath(projectRoot: string, input: string): { absolute: string; relative: string } {
  const root = resolve(projectRoot);
  const absolute = resolve(root, input);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`RDD receipt path "${input}" is outside the project root`);
  }
  const normalized = relative(root, absolute);
  if (!normalized || normalized === '.') {
    throw new Error('RDD receipts require file paths, not the project root');
  }
  return { absolute, relative: normalized.split(sep).join('/') };
}

async function fingerprint(projectRoot: string, paths: readonly string[]): Promise<RddReceiptPath[]> {
  const deduplicated = new Map<string, string>();
  for (const path of paths) {
    const canonical = canonicalPath(projectRoot, path);
    deduplicated.set(canonical.relative, canonical.absolute);
  }

  const result: RddReceiptPath[] = [];
  for (const [path, absolute] of [...deduplicated.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    result.push({ path, hash: sha256(await readFile(absolute)) });
  }
  return result;
}

function manifestHash(paths: readonly RddReceiptPath[]): string {
  return sha256(paths.map((entry) => `${entry.path}\0${entry.hash}`).join('\n'));
}

export function isRddReceipt(value: unknown): value is RddReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<RddReceipt>;
  return receipt.version === 1 &&
    typeof receipt.taskId === 'string' &&
    typeof receipt.phase === 'string' &&
    Array.isArray(receipt.paths) &&
    receipt.paths.every((entry) =>
      Boolean(entry) && typeof entry.path === 'string' && typeof entry.hash === 'string',
    ) &&
    (receipt.coverage === 'paths' || receipt.coverage === 'project') &&
    typeof receipt.manifestHash === 'string' &&
    (receipt.outcome === 'passed' || receipt.outcome === 'failed') &&
    typeof receipt.capturedAt === 'string';
}

export async function captureReceipt(
  projectRoot: string,
  input: {
    readonly taskId: string;
    readonly phase: RddPhase;
    readonly paths: readonly string[];
    readonly command?: string;
    readonly outcome: 'passed' | 'failed';
    /** Include additions and deletions across the complete project candidate. */
    readonly coverage?: 'paths' | 'project';
  },
): Promise<RddReceipt> {
  if (!input.taskId.trim()) throw new Error('RDD receipts require a task id');
  if (input.paths.length === 0 && input.coverage !== 'project') {
    throw new Error('RDD receipts require at least one protected path');
  }
  const paths = await fingerprint(projectRoot, input.paths);
  return {
    version: 1,
    taskId: input.taskId,
    phase: input.phase,
    paths,
    coverage: input.coverage ?? 'paths',
    manifestHash: manifestHash(paths),
    command: input.command,
    outcome: input.outcome,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Collect the versioned-input candidate for a local verification run. Runtime
 * state and generated output are deliberately excluded because recording a
 * receipt itself must not invalidate the candidate it describes.
 */
export async function collectReceiptPaths(projectRoot: string): Promise<string[]> {
  const root = resolve(projectRoot);
  const paths: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) await visit(join(current, entry.name));
        continue;
      }
      if (entry.isFile()) paths.push(relative(root, join(current, entry.name)).split(sep).join('/'));
    }
  }

  await visit(root);
  return paths.sort();
}

export async function verifyReceipt(projectRoot: string, receipt: RddReceipt): Promise<ReceiptVerification> {
  const expected = new Map(receipt.paths.map((entry) => [entry.path, entry.hash]));
  const changedPaths: string[] = [];
  const current: RddReceiptPath[] = [];

  const pathsToCheck = receipt.coverage === 'project'
    ? await collectReceiptPaths(projectRoot)
    : receipt.paths.map((entry) => entry.path);
  const currentByPath = new Map<string, RddReceiptPath>();

  for (const path of pathsToCheck) {
    try {
      const canonical = canonicalPath(projectRoot, path);
      const hash = sha256(await readFile(canonical.absolute));
      const currentEntry = { path: canonical.relative, hash };
      current.push(currentEntry);
      currentByPath.set(currentEntry.path, currentEntry);
      if (hash !== expected.get(currentEntry.path)) changedPaths.push(currentEntry.path);
    } catch {
      changedPaths.push(path);
    }
  }

  for (const path of expected.keys()) {
    if (!currentByPath.has(path) && !changedPaths.includes(path)) changedPaths.push(path);
  }

  changedPaths.sort();
  const actualHash = manifestHash(current.sort((left, right) => left.path.localeCompare(right.path)));
  return {
    valid: changedPaths.length === 0 && actualHash === receipt.manifestHash,
    expectedHash: receipt.manifestHash,
    actualHash,
    changedPaths,
  };
}
