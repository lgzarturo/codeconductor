/**
 * Tests for LSP package version pinning (TC2/W3).
 *
 * npm/pip installs must use exact version pins; installing `latest` from a
 * registry is a supply-chain risk. The registry itself is asserted to keep
 * every package pinned.
 */
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPinnedPackage } from '../src/core/lsp/binary-integrity';
import {
  TAR_EXTRACT_HARDENING_FLAGS,
  assertTarArchiveSafe,
  createLspInstaller,
  extractHardenedTar,
} from '../src/core/lsp/lsp-installer';
import { getAllLsps } from '../src/core/lsp/lsp-registry';
import type { LspDefinition } from '../src/domain/lsp/lsp-definition';

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

describe('LspInstaller: refuse unpinned registry installs', () => {
  test('installLsp fails closed when the npm package has no exact version', async () => {
    const def: LspDefinition = {
      id: 'unpinned-test',
      language: 'typescript',
      serverName: 'Unpinned Test Server',
      packageManager: 'npm',
      package: 'typescript-language-server',
      binaryName: 'cc-lsp-unpinned-binary-xyz',
      installCmd: 'npm install -g typescript-language-server',
      versionFlag: '--version',
    };

    const result = await createLspInstaller().installLsp(def);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not version-pinned/);
  });
});

describe('hardened tar extract (TC2/W4)', () => {
  test('extract flags include anti zip-slip ownership/mode options', () => {
    expect(TAR_EXTRACT_HARDENING_FLAGS).toContain('--no-same-owner');
    expect(TAR_EXTRACT_HARDENING_FLAGS).toContain('--no-same-permissions');
  });

  test('rejects a tar whose members escape the destination', async () => {
    const work = await mkdtemp(join(tmpdir(), 'cc-tar-slip-'));
    try {
      const payloadDir = join(work, 'payload');
      await mkdir(payloadDir);
      await writeFile(join(payloadDir, 'ok.txt'), 'ok', 'utf-8');
      const archive = join(work, 'slip.tar.gz');
      execFileSync('tar', ['--transform=s,^,../,', '-czf', archive, '-C', payloadDir, 'ok.txt']);

      await expect(assertTarArchiveSafe(archive, join(work, 'out'))).rejects.toThrow(
        /unsafe/i,
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  test('extracts a well-formed archive under the destination', async () => {
    const work = await mkdtemp(join(tmpdir(), 'cc-tar-ok-'));
    try {
      const payloadDir = join(work, 'payload');
      const out = join(work, 'out');
      await mkdir(payloadDir);
      await mkdir(out);
      await writeFile(join(payloadDir, 'ok.txt'), 'ok', 'utf-8');
      const archive = join(work, 'ok.tar.gz');
      execFileSync('tar', ['-czf', archive, '-C', payloadDir, 'ok.txt']);

      await extractHardenedTar(archive, out);
      const extracted = await Bun.file(join(out, 'ok.txt')).text();
      expect(extracted).toBe('ok');
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
