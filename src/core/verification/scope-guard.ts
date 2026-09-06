import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ScopeViolation {
  file: string;
  reason: string;
}

export interface ScopeGuardResult {
  passed: boolean;
  violations: ScopeViolation[];
  checkedFiles: string[];
  allowedFiles: string[];
}

export interface ScopeGuardOptions {
  cwd: string;
  allowedFiles: string[];
  allowlist?: string[];
  baseBranch?: string;
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
  const { cwd, allowedFiles, allowlist = [], baseBranch = 'HEAD~1' } = options;
  const changedFiles = await getChangedFiles(cwd, baseBranch);
  
  const violations: ScopeViolation[] = [];
  
  for (const file of changedFiles) {
    if (!allowedFiles.includes(file) && !isAllowlisted(file, allowlist)) {
      violations.push({
        file,
        reason: `File '${file}' is not in the allowed scope or allowlist.`
      });
    }
  }
  
  return {
    passed: violations.length === 0,
    violations,
    checkedFiles: changedFiles,
    allowedFiles
  };
}
