import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

/**
 * Protected paths that should not be modified
 */
const PROTECTED_PATHS = ['.git', '.env', '.env.local', '.env.production', 'secrets', 'credentials'];

/**
 * A credential pattern match in file content
 */
export interface CredentialMatch {
  readonly filePath: string;
  readonly line: number;
  readonly pattern: string;
  readonly matched: string;
}

/**
 * Check if a file exists
 */
export async function fileExists(dir: string, filename: string): Promise<boolean> {
  try {
    const path = filename.startsWith('/') ? filename : `${dir}/${filename}`;
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is protected
 */
export function isProtectedPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return PROTECTED_PATHS.some((p) => normalized.includes(p.toLowerCase()));
}

/**
 * Validate safe write path
 */
export function validateWritePath(path: string): boolean {
  return !isProtectedPath(path);
}

/**
 * Check if directory is writable
 */
export async function isWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build regex patterns from config secretPatterns.
 * Each pattern is matched as: <keyword>\s*[:=]\s*[^\s]{8,}
 */
function buildCredentialRegexes(patterns: ReadonlyArray<string>): RegExp[] {
  return patterns.map(
    (keyword) => new RegExp(`(?:${keyword})\\s*[:=]\\s*[^\\s]{8,}`, 'i')
  );
}

/**
 * Scan file content for credential patterns. Returns all matches found.
 */
export function scanForCredentials(
  filePath: string,
  content: string,
  secretPatterns: ReadonlyArray<string>
): CredentialMatch[] {
  const regexes = buildCredentialRegexes(secretPatterns);
  const lines = content.split('\n');
  const matches: CredentialMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const regex of regexes) {
      const m = regex.exec(line);
      if (m) {
        matches.push({
          filePath,
          line: i + 1,
          pattern: regex.source,
          matched: m[0],
        });
      }
    }
  }

  return matches;
}

/**
 * Check if content contains any credential patterns (boolean only).
 */
export function isCredentialContent(
  content: string,
  secretPatterns: ReadonlyArray<string>
): boolean {
  const regexes = buildCredentialRegexes(secretPatterns);
  const lines = content.split('\n');
  for (const line of lines) {
    for (const regex of regexes) {
      if (regex.test(line)) return true;
    }
  }
  return false;
}
