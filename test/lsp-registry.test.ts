/**
 * Tests for LSP Registry resolution and language mapping.
 */
import { describe, expect, test } from 'bun:test';
import { getAllLsps, getLspById, resolveLsps } from '../src/core/lsp/lsp-registry';

describe('LSP Registry', () => {
  describe('getAllLsps', () => {
    test('returns all 4 LSP definitions', () => {
      const lsps = getAllLsps();
      expect(lsps).toHaveLength(4);
    });

    test('contains typescript LSP', () => {
      const lsps = getAllLsps();
      const ts = lsps.find((l) => l.id === 'typescript');
      expect(ts).toBeDefined();
      expect(ts!.language).toBe('typescript');
      expect(ts!.packageManager).toBe('npm');
      expect(ts!.binaryName).toBe('typescript-language-server');
    });

    test('contains php LSP (Intelephense)', () => {
      const lsps = getAllLsps();
      const php = lsps.find((l) => l.id === 'php');
      expect(php).toBeDefined();
      expect(php!.language).toBe('php');
      expect(php!.packageManager).toBe('npm');
      expect(php!.binaryName).toBe('intelephense');
    });

    test('contains python LSP', () => {
      const lsps = getAllLsps();
      const python = lsps.find((l) => l.id === 'python');
      expect(python).toBeDefined();
      expect(python!.language).toBe('python');
      expect(python!.packageManager).toBe('pip');
      expect(python!.binaryName).toBe('pylsp');
    });

    test('contains kotlin LSP (binary)', () => {
      const lsps = getAllLsps();
      const kotlin = lsps.find((l) => l.id === 'kotlin');
      expect(kotlin).toBeDefined();
      expect(kotlin!.language).toBe('kotlin');
      expect(kotlin!.packageManager).toBe('binary');
      expect(kotlin!.binaryName).toBe('kotlin-language-server');
      expect(kotlin!.binaryPlatforms).toBeDefined();
    });
  });

  describe('getLspById', () => {
    test('returns typescript LSP by id', () => {
      const lsp = getLspById('typescript');
      expect(lsp).toBeDefined();
      expect(lsp!.id).toBe('typescript');
    });

    test('returns php LSP by id', () => {
      const lsp = getLspById('php');
      expect(lsp).toBeDefined();
      expect(lsp!.id).toBe('php');
    });

    test('returns python LSP by id', () => {
      const lsp = getLspById('python');
      expect(lsp).toBeDefined();
      expect(lsp!.id).toBe('python');
    });

    test('returns kotlin LSP by id', () => {
      const lsp = getLspById('kotlin');
      expect(lsp).toBeDefined();
      expect(lsp!.id).toBe('kotlin');
    });

    test('returns undefined for unknown id', () => {
      const lsp = getLspById('unknown-lsp');
      expect(lsp).toBeUndefined();
    });
  });

  describe('resolveLsps', () => {
    test('resolves typescript language to typescript LSP', () => {
      const lsps = resolveLsps(['typescript']);
      expect(lsps).toHaveLength(1);
      expect(lsps[0].id).toBe('typescript');
    });

    test('resolves javascript to typescript LSP', () => {
      const lsps = resolveLsps(['javascript']);
      expect(lsps).toHaveLength(1);
      expect(lsps[0].id).toBe('typescript');
    });

    test('resolves php to php LSP', () => {
      const lsps = resolveLsps(['php']);
      expect(lsps).toHaveLength(1);
      expect(lsps[0].id).toBe('php');
    });

    test('resolves python to python LSP', () => {
      const lsps = resolveLsps(['python']);
      expect(lsps).toHaveLength(1);
      expect(lsps[0].id).toBe('python');
    });

    test('resolves java to kotlin LSP', () => {
      const lsps = resolveLsps(['java']);
      expect(lsps).toHaveLength(1);
      expect(lsps[0].id).toBe('kotlin');
    });

    test('resolves kotlin to kotlin LSP', () => {
      const lsps = resolveLsps(['kotlin']);
      expect(lsps).toHaveLength(1);
      expect(lsps[0].id).toBe('kotlin');
    });

    test('resolves multiple languages to multiple LSPs', () => {
      const lsps = resolveLsps(['typescript', 'python']);
      expect(lsps).toHaveLength(2);
      expect(lsps.map((l) => l.id).sort()).toEqual(['python', 'typescript']);
    });

    test('deduplicates when same language appears twice', () => {
      const lsps = resolveLsps(['typescript', 'typescript']);
      expect(lsps).toHaveLength(1);
    });

    test('handles case-insensitive language names', () => {
      const lsps = resolveLsps(['TYPESCRIPT', 'Python', 'PHP']);
      expect(lsps).toHaveLength(3);
    });

    test('ignores unknown languages', () => {
      const lsps = resolveLsps(['typescript', 'unknown-lang', 'ruby']);
      expect(lsps).toHaveLength(1);
      expect(lsps[0].id).toBe('typescript');
    });

    test('returns empty array for no recognized languages', () => {
      const lsps = resolveLsps(['unknown-lang', 'ruby', 'go']);
      expect(lsps).toHaveLength(0);
    });

    test('returns empty array for empty input', () => {
      const lsps = resolveLsps([]);
      expect(lsps).toHaveLength(0);
    });

    // Acceptance Criterion 3: Supports 4 languages (TypeScript, PHP, Python, Kotlin)
    test('supports all 4 languages: TypeScript, PHP, Python, Kotlin', () => {
      const lsps = resolveLsps(['typescript', 'php', 'python', 'kotlin']);
      expect(lsps).toHaveLength(4);
      expect(lsps.map((l) => l.id).sort()).toEqual(['kotlin', 'php', 'python', 'typescript']);
    });
  });
});
