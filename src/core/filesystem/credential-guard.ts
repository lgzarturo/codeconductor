import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import type { CodeConductorConfig } from '../config/codeconductor-config';

/**
 * Default credential patterns used when config is not provided.
 * Matches common secret assignment patterns with values >= 8 chars.
 */
export const DEFAULT_SECRET_PATTERNS = [
  'password',
  'secret',
  'api_key',
  'token',
  'api[_-]?key',
  'access[_-]?token',
  'auth[_-]?token',
  'private[_-]?key',
];

/**
 * Path to the root policy.yml file.
 */
const POLICY_PATH = resolve(import.meta.dir, '..', '..', '..', 'policy.yml');

/**
 * Load secret patterns from policy.yml.
 * Returns an empty array if the file is missing or has no secretPatterns field.
 */
async function loadPolicyPatterns(): Promise<string[]> {
  try {
    const content = await readFile(POLICY_PATH, 'utf-8');
    const parsed = parse(content) as { secretPatterns?: string[] };
    if (Array.isArray(parsed.secretPatterns) && parsed.secretPatterns.length > 0) {
      return parsed.secretPatterns;
    }
  } catch {
    // policy.yml may not exist in all environments — silently fall back
  }
  return [];
}

/**
 * Merge and deduplicate multiple pattern arrays. Last occurrence wins for
 * ordering but duplicates are removed (first-seen kept).
 */
function mergePatterns(...arrays: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of arrays) {
    for (const p of arr) {
      if (!seen.has(p)) {
        seen.add(p);
        result.push(p);
      }
    }
  }
  return result;
}

/**
 * Load credential patterns by merging sources in priority order:
 * 1. CodeConductorConfig.safety.secretPatterns (highest — user/project overrides)
 * 2. policy.yml secretPatterns (declarative policy)
 * 3. DEFAULT_SECRET_PATTERNS (built-in fallback)
 *
 * Note: policy.yml loading is async, so this function is async.
 */
export async function loadCredentialPatterns(
  config?: CodeConductorConfig
): Promise<ReadonlyArray<string>> {
  const policyPatterns = await loadPolicyPatterns();
  const configPatterns = config?.safety?.secretPatterns;

  if (configPatterns && configPatterns.length > 0) {
    return mergePatterns(configPatterns, policyPatterns, DEFAULT_SECRET_PATTERNS);
  }
  if (policyPatterns.length > 0) {
    return mergePatterns(policyPatterns, DEFAULT_SECRET_PATTERNS);
  }
  return DEFAULT_SECRET_PATTERNS;
}
