/**
 * detect_changes — read-only impact probe.
 *
 * Crosses git diff hunks (new-side line ranges) with top-level symbol ranges
 * scanned from the changed files, returning exactly the files and symbols
 * touched. Symbol scanning is a documented heuristic for TS/JS only; other
 * languages resolve to file level.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChangedSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'const';

export interface SourceSymbol {
  readonly name: string;
  readonly kind: ChangedSymbolKind;
  /** 1-based inclusive. */
  readonly startLine: number;
  /** 1-based inclusive. */
  readonly endLine: number;
}

export interface ChangedSymbol extends SourceSymbol {
  /** Repo-relative path. */
  readonly file: string;
}

export interface DiffRange {
  readonly file: string;
  /** 1-based inclusive new-side start. Empty when endLine < startLine. */
  readonly startLine: number;
  /** 1-based inclusive new-side end. */
  readonly endLine: number;
}

export interface DetectChangesResult {
  readonly affectedFiles: string[];
  readonly affectedSymbols: ChangedSymbol[];
}

// ─── Diff parsing ────────────────────────────────────────────────────────────

const OLD_FILE_REGEX = /^--- (?:a\/)?(.+)$/;
const NEW_FILE_REGEX = /^\+\+\+ (?:b\/)?(.+)$/;
const HUNK_HEADER_REGEX = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function unquoteDiffPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseDiffRanges(diff: string): DiffRange[] {
  const ranges: DiffRange[] = [];
  let oldName = '';
  let current = '';
  let deleted = false;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      oldName = '';
      current = '';
      deleted = false;
      continue;
    }
    const oldMatch = line.match(OLD_FILE_REGEX);
    if (oldMatch) {
      oldName = unquoteDiffPath(oldMatch[1]!);
      continue;
    }
    const newMatch = line.match(NEW_FILE_REGEX);
    if (newMatch) {
      const name = unquoteDiffPath(newMatch[1]!);
      if (name === '/dev/null') {
        current = oldName.replace(/^a\//, '');
        deleted = true;
      } else {
        current = name;
        deleted = false;
      }
      continue;
    }
    const hunk = line.match(HUNK_HEADER_REGEX);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      ranges.push({
        file: current,
        startLine: deleted ? 0 : start,
        endLine: deleted ? -1 : start + count - 1,
      });
    }
  }

  return ranges;
}

// ─── Symbol scanning (TS/JS heuristic) ───────────────────────────────────────

export const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);

const DEF_PATTERNS: ReadonlyArray<{ kind: ChangedSymbolKind; regex: RegExp }> = [
  { kind: 'function', regex: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'class', regex: /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'interface', regex: /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', regex: /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: 'const', regex: /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/ },
];

const STRING_SPAN_REGEX = /('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;

function stripStringsAndComments(line: string): string {
  const noStrings = line.replace(STRING_SPAN_REGEX, '""');
  const commentAt = noStrings.indexOf('//');
  return commentAt >= 0 ? noStrings.slice(0, commentAt) : noStrings;
}

function matchDefinition(line: string): { name: string; kind: ChangedSymbolKind } | null {
  for (const { kind, regex } of DEF_PATTERNS) {
    const m = line.match(regex);
    if (m?.[1]) return { name: m[1], kind };
  }
  return null;
}

/**
 * Map top-level TS/JS symbols to 1-based inclusive line ranges via naive
 * brace matching. Only column-0 definitions are picked up, so class members
 * attribute to their enclosing class. Multi-line template literals and
 * Allman-style edge cases may skew ranges; this stays a heuristic.
 */
export function findSymbolsInSource(source: string): SourceSymbol[] {
  const lines = source.split('\n');
  const symbols: SourceSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const def = matchDefinition(lines[i]!);
    if (!def) continue;

    let depth = 0;
    let seenOpen = false;
    let end = lines.length;

    for (let j = i; j < lines.length; j++) {
      const stripped = stripStringsAndComments(lines[j]!);
      for (const ch of stripped) {
        if (ch === '{') {
          depth++;
          seenOpen = true;
        } else if (ch === '}') {
          depth--;
        }
      }
      if (!seenOpen) {
        // No body opened yet (signature spans lines, or bodiless declaration).
        if (/;\s*$/.test(stripped)) {
          end = j + 1;
          break;
        }
        continue;
      }
      if (depth === 0) {
        // Single-line bodies (`type X = {...};`, `const o = {}`) end here;
        // Allman def lines ending in `)` keep scanning for the body.
        if (j > i || /[;}]\s*$/.test(stripped)) {
          end = j + 1;
          break;
        }
      }
    }

    symbols.push({ name: def.name, kind: def.kind, startLine: i + 1, endLine: end });
  }

  return symbols;
}

// ─── Overlap ─────────────────────────────────────────────────────────────────

function rangeHitsSymbol(range: DiffRange, symbol: SourceSymbol): boolean {
  if (range.endLine < range.startLine) {
    // Empty new-side range (pure deletion): probe the anchor line.
    const probe = Math.max(range.startLine, 1);
    return symbol.startLine <= probe && probe <= symbol.endLine;
  }
  return symbol.startLine <= range.endLine && range.startLine <= symbol.endLine;
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function readGitDiff(projectRoot: string, baseCommit: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--no-color', '--no-ext-diff', '--unified=0', baseCommit, '--'],
      { cwd: projectRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Detect tracked changes against `baseCommit` (default HEAD, worktree+index).
 * Read-only: runs `git diff` and reads changed files. Untracked files and
 * non-git directories yield an empty result instead of throwing.
 */
export async function detectChanges(
  projectRoot: string,
  baseCommit = 'HEAD',
): Promise<DetectChangesResult> {
  const diff = await readGitDiff(projectRoot, baseCommit);
  if (!diff || !diff.trim()) return { affectedFiles: [], affectedSymbols: [] };

  const ranges = parseDiffRanges(diff);
  const byFile = new Map<string, DiffRange[]>();
  for (const range of ranges) {
    const list = byFile.get(range.file) ?? [];
    list.push(range);
    byFile.set(range.file, list);
  }

  const affectedFiles = [...byFile.keys()].sort();
  const affectedSymbols: ChangedSymbol[] = [];

  for (const file of affectedFiles) {
    if (!TS_EXTENSIONS.has(extname(file))) continue;
    let source: string;
    try {
      source = await readFile(join(projectRoot, file), 'utf-8');
    } catch {
      continue;
    }
    const fileRanges = byFile.get(file) ?? [];
    for (const symbol of findSymbolsInSource(source)) {
      if (fileRanges.some((range) => rangeHitsSymbol(range, symbol))) {
        affectedSymbols.push({ file, ...symbol });
      }
    }
  }

  affectedSymbols.sort(
    (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.startLine - b.startLine),
  );
  return { affectedFiles, affectedSymbols };
}
