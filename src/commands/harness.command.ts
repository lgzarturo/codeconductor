import { lstat, mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { checkProductionFiles, checkTestFiles } from '../core/verification/harness/gatekeeper';
import { buildSymbolMap, findCollisions } from '../core/verification/harness/symbol-map';
import { FREEZE_LOCK_FILE, freezeTestSuite, verifyTestFreeze } from '../core/verification/test-freeze';
import { resolveOutputWithinRoot, resolveWithinRoot } from '../core/filesystem/path-containment';
import type { OutputMode } from '../utils/logger';

export interface HarnessOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly paths?: readonly string[];
  readonly lockDir?: string;
  readonly domain?: readonly string[];
  readonly outFile?: string;
  readonly mapFile?: string;
  readonly force?: boolean;
  readonly expectedHash?: string;
}

type Result = { code: number; data: unknown };

const DEFAULT_DOMAIN = ['src/core/**'];
const DEFAULT_LOCK_DIR = '.harness';
const DEFAULT_MAP = 'SYMBOL_MAP.json';

const USAGE = [
  'harness seal --paths <dirs|files> [--lock-dir <dir>] [--force]',
  'harness verify-seal --paths <dirs|files> [--lock-dir <dir>] [--expected-hash <sha256>]',
  'harness check-code --paths <files>',
  'harness check-tests --paths <files> [--domain <globs>]',
  'harness index [--out <file>]',
  'harness collisions --paths <files> [--map <file>]',
].join('\n');

function fail(command: string, errors: string[]): Result {
  return { code: 1, data: { success: false, command, errors } };
}

function report(command: string, ok: boolean, payload: Record<string, unknown>, summary: string): Result {
  return { code: ok ? 0 : 1, data: { success: ok, command, ...payload, output: summary } };
}

/** Existing path inside the root; symlinks that leave the root are refused. */
async function existingPath(root: string, rel: string): Promise<string | undefined> {
  return resolveWithinRoot(root, rel).catch(() => undefined);
}

/** Output path inside the root: refuses symlink leaves and protected locations such as `.git`. */
async function outputPath(root: string, rel: string): Promise<string | undefined> {
  return resolveOutputWithinRoot(root, rel).catch(() => undefined);
}

export async function harnessCommand(options: HarnessOptions): Promise<Result> {
  const command = `harness ${options.subcommand}`;
  const root = resolve(options.projectRoot);
  const rels = options.paths ?? [];

  const needsPaths = ['seal', 'verify-seal', 'check-code', 'check-tests', 'collisions'];
  if (needsPaths.includes(options.subcommand) && rels.length === 0) return fail(command, [`Usage: ${USAGE}`]);

  const abs: string[] = [];
  for (const rel of rels) {
    const real = await existingPath(root, rel);
    if (!real) return fail(command, [`Path is missing or escapes the project root: ${rel}`]);
    abs.push(real);
  }

  try {
    switch (options.subcommand) {
      case 'seal':
        return await seal(command, root, rels, options);
      case 'verify-seal':
        return await verifySeal(command, root, rels, options);
      case 'check-code':
        return await checkCode(command, abs);
      case 'check-tests':
        return await checkTests(command, root, abs, options);
      case 'index':
        return await index(command, root, options);
      case 'collisions':
        return await collisions(command, root, abs, options);
      default:
        return fail(command, [`Usage: ${USAGE}`]);
    }
  } catch (e) {
    return fail(command, [e instanceof Error ? e.message : String(e)]);
  }
}

async function lockDirOf(root: string, options: HarnessOptions): Promise<string | undefined> {
  return outputPath(root, options.lockDir ?? DEFAULT_LOCK_DIR);
}

async function seal(command: string, root: string, rels: readonly string[], options: HarnessOptions): Promise<Result> {
  const lockDir = await lockDirOf(root, options);
  if (!lockDir) return fail(command, ['Lock dir is not an allowed destination']);

  const lockPath = join(lockDir, FREEZE_LOCK_FILE);
  const existing = await lstat(lockPath).catch(() => undefined);
  if (existing?.isSymbolicLink()) return fail(command, ['Lock file is a symlink']);
  if (existing && options.force !== true) {
    return fail(command, ['A seal already exists; re-sealing replaces it. Pass --force to confirm.']);
  }

  await mkdir(lockDir, { recursive: true });
  const manifest = await freezeTestSuite([...rels], lockDir, root);
  return report(
    command,
    true,
    { hash: manifest.hash, files: manifest.files.length },
    `Sealed ${manifest.files.length} files (${manifest.hash}). Keep the hash outside the working tree and pass it to verify-seal --expected-hash.`,
  );
}

async function verifySeal(command: string, root: string, rels: readonly string[], options: HarnessOptions): Promise<Result> {
  const lockDir = await lockDirOf(root, options);
  if (!lockDir) return fail(command, ['Lock dir is not an allowed destination']);
  const result = await verifyTestFreeze(join(lockDir, FREEZE_LOCK_FILE), [...rels], root);
  const anchored = options.expectedHash === undefined || result.actualHash === options.expectedHash;
  const ok = result.valid && anchored;
  return report(
    command,
    ok,
    { tamperedFiles: result.tamperedFiles, hash: result.actualHash },
    ok
      ? 'Seal intact.'
      : `Seal violated: ${result.tamperedFiles.join(', ') || (anchored ? 'lock inconsistent' : 'hash differs from --expected-hash')}`,
  );
}

async function checkCode(command: string, files: string[]): Promise<Result> {
  const violations = await checkProductionFiles(files);
  return report(command, violations.length === 0, { violations }, `${violations.length} violation(s).`);
}

async function checkTests(command: string, root: string, files: string[], options: HarnessOptions): Promise<Result> {
  const violations = await checkTestFiles(files, options.domain ?? DEFAULT_DOMAIN, root);
  return report(command, violations.length === 0, { violations }, `${violations.length} violation(s).`);
}

async function index(command: string, root: string, options: HarnessOptions): Promise<Result> {
  const out = await outputPath(root, options.outFile ?? DEFAULT_MAP);
  if (!out) return fail(command, ['Output path is not an allowed destination']);
  const { map, parsed, reused } = await buildSymbolMap(root, out);
  const modules = Object.keys(map.modules).length;
  return report(
    command,
    true,
    { modules, parsed, reused, path: relative(root, out) },
    `Indexed ${modules} modules (${parsed} parsed, ${reused} reused).`,
  );
}

async function collisions(command: string, root: string, files: string[], options: HarnessOptions): Promise<Result> {
  const map = await outputPath(root, options.mapFile ?? DEFAULT_MAP);
  if (!map) return fail(command, ['Map path is not an allowed destination']);
  const found = await findCollisions(map, files, root);
  return report(command, found.length === 0, { collisions: found }, `${found.length} collision(s).`);
}
