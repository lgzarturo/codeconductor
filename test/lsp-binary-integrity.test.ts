/**
 * Tests for LSP binary integrity helpers (pin, checksum, zip-slip).
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  assertBinaryArtifact,
  assertPinnedBinaryUrl,
  assertSha256Hex,
  resolveSafeArchiveEntry,
} from '../src/core/lsp/binary-integrity';

describe('LSP binary integrity', () => {
  test('rejects floating /latest/ download URLs', () => {
    expect(() =>
      assertPinnedBinaryUrl(
        'https://github.com/fwcd/kotlin-language-server/releases/latest/download/server.tar.gz',
      ),
    ).toThrow(/pinned|latest/i);
  });

  test('rejects non-https binary URLs', () => {
    expect(() =>
      assertPinnedBinaryUrl('http://example.com/v1.0.0/server.tar.gz'),
    ).toThrow(/https/i);
  });

  test('accepts a version-pinned https URL', () => {
    expect(() =>
      assertPinnedBinaryUrl(
        'https://github.com/fwcd/kotlin-language-server/releases/download/1.3.13/server-linux-x64.tar.gz',
      ),
    ).not.toThrow();
  });

  test('requires a 64-char sha256 on binary artifacts', () => {
    expect(() =>
      assertBinaryArtifact({
        url: 'https://example.com/releases/download/1.0.0/server.tar.gz',
      }),
    ).toThrow(/sha256/i);

    expect(() =>
      assertBinaryArtifact({
        url: 'https://example.com/releases/download/1.0.0/server.tar.gz',
        sha256: 'deadbeef',
      }),
    ).toThrow(/64-character/i);
  });

  test('verifies sha256 of downloaded bytes', () => {
    const payload = new TextEncoder().encode('kotlin-lsp');
    const digest = createHash('sha256').update(payload).digest('hex');
    expect(() => assertSha256Hex(payload, digest)).not.toThrow();
    expect(() => assertSha256Hex(payload, '0'.repeat(64))).toThrow(/mismatch/i);
  });

  test('rejects zip-slip archive entries', () => {
    const dest = resolve('/tmp/cc-lsp-bin');
    expect(() => resolveSafeArchiveEntry(dest, '../outside')).toThrow(/unsafe/i);
    expect(() => resolveSafeArchiveEntry(dest, '/etc/passwd')).toThrow(/unsafe/i);
    expect(() => resolveSafeArchiveEntry(dest, 'nested/../../etc/passwd')).toThrow(
      /unsafe/i,
    );
    expect(resolveSafeArchiveEntry(dest, 'server/bin/kotlin-language-server')).toBe(
      resolve(dest, 'server/bin/kotlin-language-server'),
    );
  });
});
