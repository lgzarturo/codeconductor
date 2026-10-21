import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectChanges, type ChangedSymbol } from '../impact/detect-changes';

const execFileAsync = promisify(execFile);

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

async function getChangedFiles(cwd: string, base: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', base], { cwd, encoding: 'utf8' });
    return stdout.trim().split('\n').filter(Boolean);
  } catch (e) {
    // Graceful handling of git failure (e.g. no git repo)
    return [];
  }
}

function isAllowlisted(file: string, allowlist: string[]): boolean {
  for (const pattern of allowlist) {
    if (pattern.includes('*')) {
      // Basic glob matching: * matches anything except /, ** matches anything
      let regexStr = pattern;
      if (pattern.includes('**')) {
        regexStr = regexStr.replace(/\*\*/g, '.*');
      } else {
        regexStr = regexStr.replace(/\*/g, '[^/]*');
      }
      regexStr = '^' + regexStr + '$';
      if (new RegExp(regexStr).test(file)) {
        return true;
      }
    } else {
      if (file === pattern) {
        return true;
      }
    }
  }
  return false;
}

export async function checkScopeCompliance(options: ScopeGuardOptions): Promise<ScopeGuardResult> {
  const { cwd, allowedFiles, allowlist = [], baseBranch = 'HEAD~1', allowedSymbols = {} } = options;
  const changedFiles = await getChangedFiles(cwd, baseBranch);
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
