/**
 * Code index — structural symbol map so agents resolve definitions without
 * loading whole files (graph-first routing).
 *
 * Plain JSON under .codeconductor, consistent with the other harness stores.
 * SQLite was considered and rejected: node:sqlite would break the declared
 * node >=20.11 engines range, and an index of this size needs no database.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import {
  findSymbolsInSource,
  TS_EXTENSIONS,
  type ChangedSymbolKind,
} from '../impact/detect-changes';
import { scopeMatchesFile } from '../hooks/hook-runner';
import { CodeIndexSchema } from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';

export const CODE_INDEX_VERSION = 1;

const INDEX_FILE = '.codeconductor/code-index.json';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.codeconductor', 'coverage']);

export interface IndexedSymbol {
  readonly name: string;
  readonly kind: ChangedSymbolKind;
  readonly startLine: number;
  readonly endLine: number;
}

export interface CodeSymbolHit extends IndexedSymbol {
  readonly file: string;
}

export interface CodeIndex {
  readonly version: number;
  readonly generatedAt: string;
  readonly files: Record<string, IndexedSymbol[]>;
}

function toPosix(root: string, full: string): string {
  return relative(root, full).split(sep).join('/');
}

async function collectSourceFiles(root: string, dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await collectSourceFiles(root, join(dir, entry.name), out);
      }
    } else if (entry.isFile() && TS_EXTENSIONS.has(extname(entry.name))) {
      out.push(join(dir, entry.name));
    }
  }
}

export async function buildCodeIndex(
  projectRoot: string,
  dirs: readonly string[] = ['src'],
): Promise<Result<CodeIndex, Error>> {
  try {
    const root = resolve(projectRoot);
    const seen = new Set<string>();
    const files: Record<string, IndexedSymbol[]> = {};
    for (const dir of dirs) {
      const found: string[] = [];
      await collectSourceFiles(root, resolve(root, dir), found);
      for (const full of found) {
        const key = toPosix(root, full);
        if (seen.has(key)) continue;
        seen.add(key);
        let source: string;
        try {
          source = await readFile(full, 'utf-8');
        } catch {
          continue;
        }
        files[key] = findSymbolsInSource(source);
      }
    }
    return ok({
      version: CODE_INDEX_VERSION,
      generatedAt: new Date().toISOString(),
      files,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function saveCodeIndex(
  projectRoot: string,
  index: CodeIndex,
): Promise<Result<{ path: string }, Error>> {
  const dir = resolve(projectRoot, '.codeconductor');
  const temporary = resolve(dir, `code-index.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(temporary, JSON.stringify(index, null, 2), { encoding: 'utf-8', flag: 'wx' });
    const path = resolve(projectRoot, INDEX_FILE);
    await rename(temporary, path);
    return ok({ path });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  } finally {
    await unlink(temporary).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
}

export async function loadCodeIndex(projectRoot: string): Promise<Result<CodeIndex, Error>> {
  let raw: string;
  try {
    raw = await readFile(resolve(projectRoot, INDEX_FILE), 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return err(new Error('Code index not found. Run `code-index build` first.'));
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(new Error('Code index is corrupt: invalid JSON'));
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as { version?: unknown }).version !== CODE_INDEX_VERSION) {
    return err(new Error('Code index is stale. Run `code-index build` to rebuild it.'));
  }
  const validated = CodeIndexSchema.safeParse(parsed);
  if (!validated.success) {
    return err(new Error('Code index is corrupt: schema mismatch'));
  }
  return ok({
    version: validated.data.version,
    generatedAt: validated.data.generatedAt,
    files: validated.data.files,
  });
}

export function findSymbols(index: CodeIndex, name: string): CodeSymbolHit[] {
  const hits: CodeSymbolHit[] = [];
  for (const [file, symbols] of Object.entries(index.files)) {
    for (const symbol of symbols) {
      if (symbol.name === name) hits.push({ file, ...symbol });
    }
  }
  hits.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.startLine - b.startLine,
  );
  return hits;
}

export function symbolsInFile(index: CodeIndex, file: string): IndexedSymbol[] {
  const key = file.replace(/\\/g, '/').replace(/^\.\//, '');
  return index.files[key] ?? [];
}

export interface CodeIndexStats {
  readonly bytes: number;
  readonly files: number;
  readonly symbols: number;
  readonly loadMs: number;
  readonly findMs: number;
  readonly topFiles: ReadonlyArray<{ file: string; symbols: number }>;
}

/**
 * Size/latency evidence for the JSON-vs-SQLite decision. Times a real
 * load (parse + schema validation) and a full-sweep find over the index.
 */
export async function measureCodeIndex(projectRoot: string): Promise<Result<CodeIndexStats, Error>> {
  let bytes: number;
  try {
    bytes = (await stat(resolve(projectRoot, INDEX_FILE))).size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return err(new Error('Code index not found. Run `code-index build` first.'));
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
  const loadStart = Date.now();
  const loaded = await loadCodeIndex(projectRoot);
  if (!loaded.success) return loaded;
  const loadMs = Date.now() - loadStart;

  const entries = Object.entries(loaded.data.files);
  const symbols = entries.reduce((n, [, list]) => n + list.length, 0);
  const probe = entries.length > 0 && entries[0]![1].length > 0 ? entries[0]![1][0]!.name : '';
  const findStart = Date.now();
  findSymbols(loaded.data, probe);
  const findMs = Date.now() - findStart;

  const topFiles = entries
    .map(([file, list]) => ({ file, symbols: list.length }))
    .sort((a, b) => b.symbols - a.symbols || (a.file < b.file ? -1 : 1))
    .slice(0, 5);

  return ok({ bytes, files: entries.length, symbols, loadMs, findMs, topFiles });
}

export interface ScopeSelection {
  readonly in: readonly string[];
  readonly out?: readonly string[];
}

/**
 * Expand scope entries (prefixes like TaskCard Scope `in`) to indexed files.
 * An empty `in` list resolves to no files; exclusions in `out` win.
 */
export async function resolveScopeFiles(
  projectRoot: string,
  scope: ScopeSelection,
): Promise<Result<string[], Error>> {
  if (scope.in.length === 0) return ok([]);
  const loaded = await loadCodeIndex(projectRoot);
  if (!loaded.success) return loaded;
  const out = scope.out ?? [];
  const files = Object.keys(loaded.data.files)
    .filter((file) => scopeMatchesFile(file, scope.in) && !scopeMatchesFile(file, out))
    .sort();
  return ok(files);
}
