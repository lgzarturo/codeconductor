import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

/**
 * Protected names that should not be modified. Matched per path segment, so
 * `.env.local` and `credentials.json` are covered by their base name while
 * lookalikes such as `environment` or `mycredentials` are not.
 */
const PROTECTED_PATHS = ['.git', '.env', 'secrets', 'credentials'];

/**
 * A credential pattern match in file content.
 * `matched` is always the redaction marker — the offending text is never
 * retained, so matches are safe to log, serialize, or print.
 */
export interface CredentialMatch {
  readonly filePath: string;
  readonly line: number;
  readonly pattern: string;
  readonly matched: string;
}

const REDACTED = '[REDACTED]';

/**
 * Literal values published in vendor documentation. Matching is by exact value,
 * never by substring: any other value with a valid shape is a credential, even
 * when it happens to read like a placeholder.
 */
const KNOWN_DEMO_VALUES: ReadonlySet<string> = new Set([
  'AKIAIOSFODNN7EXAMPLE',
  'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
]);

interface CredentialSignature {
  readonly id: string;
  /** Capture group 1, when present, isolates the credential value itself. */
  readonly regex: RegExp;
}

/**
 * Provider-specific credential shapes. Always scanned, independent of the
 * configured `secretPatterns`, because a match on these is unambiguous.
 */
export const HIGH_CONFIDENCE_SIGNATURES: ReadonlyArray<CredentialSignature> = [
  { id: 'aws-access-key-id', regex: /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/ },
  {
    id: 'aws-secret-access-key',
    regex: /\bAWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/,
  },
  { id: 'github-pat-classic', regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { id: 'github-pat-fine-grained', regex: /\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/ },
  { id: 'private-key-block', regex: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/ },
];

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
  const segments = path.toLowerCase().replace(/\\/g, '/').split('/');
  return segments.some((segment) =>
    PROTECTED_PATHS.some(
      (protectedName) => segment === protectedName || segment.startsWith(`${protectedName}.`)
    )
  );
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

/** Escape every regex metacharacter so a keyword is matched as literal text. */
function regexEscape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/**
 * Build regex patterns from config secretPatterns.
 * Each pattern is matched as: <keyword>\s*[:=]\s*[^\s]{8,}
 *
 * Legacy keyword matching — only applied to patterns a project opts into.
 * Keywords are plain strings, not regexes: they are escaped before
 * interpolation, so metacharacters cannot alter the shape of the match, make
 * the pattern uncompilable, or introduce catastrophic backtracking.
 */
function buildCredentialRegexes(patterns: ReadonlyArray<string>): RegExp[] {
  return patterns.map(
    (keyword) => new RegExp(`(?:${regexEscape(keyword)})\\s*[:=]\\s*[^\\s]{8,}`, 'i')
  );
}

/**
 * Scan file content for credentials. Returns all matches found.
 *
 * High-confidence signatures always apply; `secretPatterns` adds opt-in
 * keyword matching on top of them.
 */
export function scanForCredentials(
  filePath: string,
  content: string,
  secretPatterns: ReadonlyArray<string>
): CredentialMatch[] {
  const keywordRegexes = buildCredentialRegexes(secretPatterns);
  const lines = content.split('\n');
  const matches: CredentialMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const signature of HIGH_CONFIDENCE_SIGNATURES) {
      const m = signature.regex.exec(line);
      if (m && !KNOWN_DEMO_VALUES.has(m[1] ?? m[0])) {
        matches.push({
          filePath,
          line: i + 1,
          pattern: signature.id,
          matched: REDACTED,
        });
      }
    }

    for (const regex of keywordRegexes) {
      if (regex.test(line)) {
        matches.push({
          filePath,
          line: i + 1,
          pattern: regex.source,
          matched: REDACTED,
        });
      }
    }
  }

  return matches;
}

/**
 * Check if content contains any credential (boolean only).
 */
export function isCredentialContent(
  content: string,
  secretPatterns: ReadonlyArray<string>
): boolean {
  return scanForCredentials('', content, secretPatterns).length > 0;
}
