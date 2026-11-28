import { detectChanges, type ChangedSymbol } from '../impact/detect-changes';
import {
  listChangedAndWorkingTreePaths,
  matchAllowlistPattern,
} from './git-working-tree';

export interface ScopeViolation {
  file: string;
  reason: string;
  /** Touched symbols in the file (TS/JS heuristic; empty when unknown). */
  symbols?: string[];
}

export interface ScopeGuardResult {
  passed: boolean;
  violations: ScopeViolation[];
  checkedFiles: string[];
  allowedFiles: string[];
  affectedSymbols: ChangedSymbol[];
  /** Set when the guard could not read a git diff; passed is always false. */
  error?: string;
}

export interface ScopeGuardOptions {
  cwd: string;
  allowedFiles: string[];
  allowlist?: string[];
  baseBranch?: string;
  /**
   * Symbol-level boundary for in-scope files: file -> allowed symbol names.
   * Files without an entry keep file-level behavior.
   */
  allowedSymbols?: Record<string, string[]>;
}

/** Harness-owned runtime paths are not part of the implementer's deliverable scope. */
const HARNESS_RUNTIME_PREFIXES = ['.codeconductor/', '.harness/'] as const;

function isHarnessRuntimePath(file: string): boolean {
  const normalized = file.split('\\').join('/');
  return HARNESS_RUNTIME_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

function isAllowlisted(file: string, allowlist: string[]): boolean {
  return allowlist.some((pattern) => matchAllowlistPattern(file, pattern));
}

export async function checkScopeCompliance(options: ScopeGuardOptions): Promise<ScopeGuardResult> {
  const { cwd, allowedFiles, allowlist = [], baseBranch = 'HEAD~1', allowedSymbols = {} } = options;
  const changed = await listChangedAndWorkingTreePaths(cwd, baseBranch);
  if (!changed.ok) {
    return {
      passed: false,
      violations: [{ file: '(git)', reason: changed.error }],
      checkedFiles: [],
      allowedFiles,
      affectedSymbols: [],
      error: changed.error,
    };
  }

  const changedFiles = changed.files.filter((file) => !isHarnessRuntimePath(file));
  const impact = await detectChanges(cwd, baseBranch);
  const touchedByFile = new Map<string, string[]>();
  for (const symbol of impact.affectedSymbols) {
    const list = touchedByFile.get(symbol.file) ?? [];
    list.push(symbol.name);
    touchedByFile.set(symbol.file, list);
  }

  const violations: ScopeViolation[] = [];

  for (const file of changedFiles) {
    const touched = touchedByFile.get(file) ?? [];
    if (!allowedFiles.includes(file) && !isAllowlisted(file, allowlist)) {
      violations.push({
        file,
        reason: touched.length > 0
          ? `File '${file}' is not in the allowed scope or allowlist. Touched symbols: ${touched.join(', ')}.`
          : `File '${file}' is not in the allowed scope or allowlist.`,
        symbols: touched,
      });
      continue;
    }
    const allowed = allowedSymbols[file];
    if (allowed !== undefined) {
      const offending = touched.filter((name) => !allowed.includes(name));
      if (offending.length > 0) {
        violations.push({
          file,
          reason: `Symbol(s) ${offending.map((n) => `'${n}'`).join(', ')} in '${file}' are outside the allowed symbol scope.`,
          symbols: offending,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    checkedFiles: changedFiles,
    allowedFiles,
    affectedSymbols: impact.affectedSymbols,
  };
}
