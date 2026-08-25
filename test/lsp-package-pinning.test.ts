/**
 * Tests for LSP package version pinning (TC2/W3).
 *
 * npm/pip installs must use exact version pins; installing `latest` from a
 * registry is a supply-chain risk. The registry itself is asserted to keep
 * every package pinned.
 */
import { describe, expect, test } from 'bun:test';
import { assertPinnedPackage } from '../src/core/lsp/binary-integrity';
import { getAllLsps } from '../src/core/lsp/lsp-registry';

describe('assertPinnedPackage', () => {
  const base = { serverName: 'Test Server' };

  test('accepts an exact npm version pin', () => {
    expect(() =>
      assertPinnedPackage({ ...base, packageManager: 'npm', package: 'pyright@1.1.413' }),
    ).not.toThrow();
  });

  test('accepts a scoped npm version pin', () => {
    expect(() =>
      assertPinnedPackage({ ...base, packageManager: 'npm', package: '@scope/pkg@2.0.1' }),
    ).not.toThrow();
  });

  test('accepts an exact pip version pin', () => {
    expect(() =>
      assertPinnedPackage({ ...base, packageManager: 'pip', package: 'ruff-lsp==0.0.62' }),
    ).not.toThrow();
  });

  test('rejects an unpinned npm package', () => {
    expect(() =>
      assertPinnedPackage({ ...base, packageManager: 'npm', package: 'pyright' }),
    ).toThrow(/not version-pinned/);
  });

  test('rejects an unpinned scoped npm package', () => {
    expect(() =>
      assertPinnedPackage({ ...base, packageManager: 'npm', package: '@scope/pkg' }),
    ).toThrow(/not version-pinned/);
  });

  test('rejects an unpinned pip package', () => {
    expect(() =>
      assertPinnedPackage({ ...base, packageManager: 'pip', package: 'ruff-lsp' }),
    ).toThrow(/not version-pinned/);
  });

  test('rejects floating npm tags', () => {
    expect(() =>
      assertPinnedPackage({ ...base, packageManager: 'npm', package: 'pyright@latest' }),
    ).toThrow(/not version-pinned/);
  });
});

describe('LSP registry: every registry package is pinned', () => {
  test('all npm/pip definitions carry an exact version pin', () => {
    for (const def of getAllLsps()) {
      if (def.packageManager === 'binary') continue;
      expect(() => assertPinnedPackage(def)).not.toThrow();
    }
  });

  test('installCmd matches the pinned package', () => {
    for (const def of getAllLsps()) {
      if (def.packageManager === 'npm') {
        expect(def.installCmd).toContain(def.package);
      }
    }
  });
});
