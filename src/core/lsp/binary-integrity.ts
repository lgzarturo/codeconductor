/**
 * Binary LSP integrity helpers — pin URLs, verify digests, reject archive escapes.
 */
import { createHash } from 'node:crypto';
import { isAbsolute, resolve, sep } from 'node:path';

/** Reject floating / mutable download endpoints. */
export function assertPinnedBinaryUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid binary URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Binary URL must use https: ${url}`);
  }
  if (/\/latest(\/|$)/i.test(parsed.pathname)) {
    throw new Error(`Binary URL must be version-pinned (no /latest/): ${url}`);
  }
}

/**
 * Reject npm/pip package specs without an exact version pin.
 *
 * Installing `latest` from a registry is a supply-chain risk: a compromised
 * release would be picked up silently on the next install. Pinned specs look
 * like `name@1.2.3` or `@scope/name@1.2.3` (pip: `name==1.2.3`).
 */
export function assertPinnedPackage(def: {
  readonly serverName: string;
  readonly packageManager: string;
  readonly package: string;
}): void {
  const pinned =
    def.packageManager === 'pip'
      ? /^[A-Za-z0-9._-]+==\d[^\s]*$/.test(def.package)
      : /^(@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+@\d[^\s]*$/.test(def.package);
  if (!pinned) {
    throw new Error(
      `Refusing to install ${def.serverName}: package "${def.package}" is not version-pinned. ` +
        'Record an exact version (e.g. name@1.2.3) before installing.',
    );
  }
}

export function assertSha256Hex(content: Uint8Array, expectedHex: string): void {
  const expected = expectedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error('Binary sha256 must be a 64-character hex digest');
  }
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `Binary sha256 mismatch: expected ${expected}, got ${actual}`,
    );
  }
}

/**
 * Resolve an archive member under `destRoot`, rejecting traversal and absolute
 * paths (zip-slip).
 */
export function resolveSafeArchiveEntry(destRoot: string, entry: string): string {
  const normalized = entry.replace(/\\/g, '/');
  if (
    normalized === '' ||
    isAbsolute(normalized) ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe archive entry rejected: ${entry}`);
  }

  const root = resolve(destRoot);
  const target = resolve(root, normalized);
  const rel = target.slice(root.length);
  if (target !== root && (rel === '' || !rel.startsWith(sep))) {
    throw new Error(`Unsafe archive entry rejected: ${entry}`);
  }
  return target;
}

export function assertBinaryArtifact(
  artifact: { readonly url: string; readonly sha256?: string },
): asserts artifact is { readonly url: string; readonly sha256: string } {
  assertPinnedBinaryUrl(artifact.url);
  if (typeof artifact.sha256 !== 'string' || artifact.sha256.trim() === '') {
    throw new Error(`Binary download requires a pinned sha256: ${artifact.url}`);
  }
  // Validate shape early; content is checked after download.
  if (!/^[0-9a-fA-F]{64}$/.test(artifact.sha256.trim())) {
    throw new Error('Binary sha256 must be a 64-character hex digest');
  }
}
