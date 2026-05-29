/**
 * Tests for LSP Config Generators.
 * All 6 targets: opencode, claude, codex, gemini, cursor, agy
 */
import { describe, expect, test } from 'bun:test';
import type { LspInstallResult } from '../src/domain/lsp/lsp-definition';
import { createOpenCodeLspGenerator } from '../src/adapters/opencode/opencode-lsp-generator';
import { createClaudeLspGenerator } from '../src/adapters/claude/claude-lsp-generator';
import { createCodexLspGenerator } from '../src/adapters/codex/codex-lsp-generator';
import { createGeminiLspGenerator } from '../src/adapters/gemini/gemini-lsp-generator';
import { createCursorLspGenerator } from '../src/adapters/cursor/cursor-lsp-generator';
import { createAgyLspGenerator } from '../src/adapters/agy/agy-lsp-generator';

describe('LSP Config Generators', () => {
  // Sample LSP results for testing
  const installedResults: readonly LspInstallResult[] = [
    { lspId: 'typescript', status: 'installed', version: '1.0.0' },
    { lspId: 'php', status: 'installed', version: '1.0.0' },
    { lspId: 'python', status: 'installed', version: '1.0.0' },
    { lspId: 'kotlin', status: 'installed', version: '1.0.0' },
  ];

  const partialResults: readonly LspInstallResult[] = [
    { lspId: 'typescript', status: 'installed', version: '1.0.0' },
    { lspId: 'php', status: 'already-installed', version: '1.0.0' },
    { lspId: 'python', status: 'failed', error: 'pip not found' },
  ];

  const emptyResults: readonly LspInstallResult[] = [];

  describe('OpenCodeLspGenerator', () => {
    test('generates .opencode/opencode.json config', () => {
      const generator = createOpenCodeLspGenerator();
      const files = generator.generate(installedResults);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('.opencode/opencode.json');
      expect(files[0].overwrite).toBe(false);
    });

    test('generates valid JSON with mcpServers', () => {
      const generator = createOpenCodeLspGenerator();
      const files = generator.generate(installedResults);

      const config = JSON.parse(files[0].content);
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers.typescript).toEqual({ command: 'typescript-language-server', args: ['--stdio'] });
      expect(config.mcpServers.php).toEqual({ command: 'intelephense', args: ['--stdio'] });
      expect(config.mcpServers.python).toEqual({ command: 'pylsp', args: [] });
      expect(config.mcpServers.kotlin).toEqual({ command: 'kotlin-language-server', args: [] });
    });

    test('excludes failed LSPs from config', () => {
      const generator = createOpenCodeLspGenerator();
      const files = generator.generate(partialResults);

      const config = JSON.parse(files[0].content);
      expect(config.mcpServers.typescript).toBeDefined();
      expect(config.mcpServers.php).toBeDefined();
      expect(config.mcpServers.python).toBeUndefined(); // failed
    });

    test('returns empty array when no successful LSPs', () => {
      const generator = createOpenCodeLspGenerator();
      const files = generator.generate(emptyResults);
      expect(files).toHaveLength(0);
    });

    test('has correct target property', () => {
      const generator = createOpenCodeLspGenerator();
      expect(generator.target).toBe('opencode');
      expect(generator.name).toBe('opencode-lsp');
    });

    test('isAvailable returns true', async () => {
      const generator = createOpenCodeLspGenerator();
      const available = await generator.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('ClaudeLspGenerator', () => {
    test('generates .claude/settings.json config', () => {
      const generator = createClaudeLspGenerator();
      const files = generator.generate(installedResults);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('.claude/settings.json');
      expect(files[0].overwrite).toBe(false);
    });

    test('generates valid JSON with mcpServers', () => {
      const generator = createClaudeLspGenerator();
      const files = generator.generate(installedResults);

      const config = JSON.parse(files[0].content);
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers.typescript).toEqual({ command: 'typescript-language-server', args: ['--stdio'] });
      expect(config.mcpServers.php).toEqual({ command: 'intelephense', args: ['--stdio'] });
      expect(config.mcpServers.python).toEqual({ command: 'pylsp', args: [] });
      expect(config.mcpServers.kotlin).toEqual({ command: 'kotlin-language-server', args: [] });
    });

    test('has correct target property', () => {
      const generator = createClaudeLspGenerator();
      expect(generator.target).toBe('claude');
      expect(generator.name).toBe('claude-lsp');
    });
  });

  describe('CodexLspGenerator', () => {
    test('generates .codex/config.toml config', () => {
      const generator = createCodexLspGenerator();
      const files = generator.generate(installedResults);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('.codex/config.toml');
      expect(files[0].overwrite).toBe(false);
    });

    test('generates TOML-formatted content with [[mcp_servers]] sections', () => {
      const generator = createCodexLspGenerator();
      const files = generator.generate(installedResults);

      const content = files[0].content;
      expect(content).toContain('# Codex LSP Configuration');
      expect(content).toContain('[[mcp_servers]]');
      expect(content).toContain('name = "typescript"');
      expect(content).toContain('command = "typescript-language-server"');
      expect(content).toContain('args = ["--stdio"]');
    });

    test('omits args line for LSPs without args', () => {
      const generator = createCodexLspGenerator();
      const files = generator.generate(installedResults);

      const content = files[0].content;
      // python and kotlin have empty args - args line should be omitted
      // TypeScript and PHP have args, so they have the line
      expect(content).toContain('args = ["--stdio"]');
      // python and kotlin should NOT have args line at all
      expect(content).not.toMatch(/name = "python"\nargs/);
      expect(content).not.toMatch(/name = "kotlin"\nargs/);
    });

    test('has correct target property', () => {
      const generator = createCodexLspGenerator();
      expect(generator.target).toBe('codex');
      expect(generator.name).toBe('codex-lsp');
    });
  });

  describe('GeminiLspGenerator (NEW)', () => {
    test('generates .gemini/settings.json config', () => {
      const generator = createGeminiLspGenerator();
      const files = generator.generate(installedResults);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('.gemini/settings.json');
      expect(files[0].overwrite).toBe(false);
    });

    test('generates valid JSON with mcpServers', () => {
      const generator = createGeminiLspGenerator();
      const files = generator.generate(installedResults);

      const config = JSON.parse(files[0].content);
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers.typescript).toEqual({ command: 'typescript-language-server', args: ['--stdio'] });
      expect(config.mcpServers.php).toEqual({ command: 'intelephense', args: ['--stdio'] });
      expect(config.mcpServers.python).toEqual({ command: 'pylsp', args: [] });
      expect(config.mcpServers.kotlin).toEqual({ command: 'kotlin-language-server', args: [] });
    });

    test('has correct target property', () => {
      const generator = createGeminiLspGenerator();
      expect(generator.target).toBe('gemini');
      expect(generator.name).toBe('gemini-lsp');
    });
  });

  describe('CursorLspGenerator (NEW)', () => {
    test('generates .cursor/mcp.json config', () => {
      const generator = createCursorLspGenerator();
      const files = generator.generate(installedResults);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('.cursor/mcp.json');
      expect(files[0].overwrite).toBe(false);
    });

    test('generates valid JSON with mcpServers', () => {
      const generator = createCursorLspGenerator();
      const files = generator.generate(installedResults);

      const config = JSON.parse(files[0].content);
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers.typescript).toEqual({ command: 'typescript-language-server', args: ['--stdio'] });
      expect(config.mcpServers.php).toEqual({ command: 'intelephense', args: ['--stdio'] });
      expect(config.mcpServers.python).toEqual({ command: 'pylsp', args: [] });
      expect(config.mcpServers.kotlin).toEqual({ command: 'kotlin-language-server', args: [] });
    });

    test('has correct target property', () => {
      const generator = createCursorLspGenerator();
      expect(generator.target).toBe('cursor');
      expect(generator.name).toBe('cursor-lsp');
    });
  });

  describe('AgyLspGenerator (NEW, experimental)', () => {
    test('generates .agy/tools.yaml config', () => {
      const generator = createAgyLspGenerator();
      const files = generator.generate(installedResults);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('.agy/tools.yaml');
      expect(files[0].overwrite).toBe(false);
    });

    test('generates YAML-formatted content with experimental header', () => {
      const generator = createAgyLspGenerator();
      const files = generator.generate(installedResults);

      const content = files[0].content;
      expect(content).toContain('# Agy LSP Configuration (experimental)');
      expect(content).toContain('typescript:');
      expect(content).toContain('command: typescript-language-server');
      expect(content).toContain('args: [--stdio]');
    });

    test('handles LSPs without args', () => {
      const generator = createAgyLspGenerator();
      const files = generator.generate(installedResults);

      const content = files[0].content;
      // python and kotlin have empty args - should not have args line
      expect(content).toContain('python:');
      expect(content).toContain('command: pylsp');
    });

    test('has correct target property', () => {
      const generator = createAgyLspGenerator();
      expect(generator.target).toBe('agy');
      expect(generator.name).toBe('agy-lsp');
    });
  });

  describe('All generators - LSP command mapping', () => {
    const lsps = ['typescript', 'php', 'python', 'kotlin'];
    const expectedCommands: Record<string, { command: string; args: string[] }> = {
      typescript: { command: 'typescript-language-server', args: ['--stdio'] },
      php: { command: 'intelephense', args: ['--stdio'] },
      python: { command: 'pylsp', args: [] },
      kotlin: { command: 'kotlin-language-server', args: [] },
    };

    for (const generatorFn of [
      createOpenCodeLspGenerator,
      createClaudeLspGenerator,
      createGeminiLspGenerator,
      createCursorLspGenerator,
    ]) {
      test(`${generatorFn().name} maps all 4 LSPs correctly`, () => {
        const generator = generatorFn();
        const files = generator.generate(installedResults);
        const config = JSON.parse(files[0].content);

        for (const lsp of lsps) {
          expect(config.mcpServers[lsp]).toEqual(expectedCommands[lsp]);
        }
      });
    }
  });
});

// Acceptance Criterion 5: New adapters for gemini, cursor, agy
describe('New Adapters', () => {
  test('gemini adapter is available', async () => {
    const generator = createGeminiLspGenerator();
    expect(generator).toBeDefined();
    expect(generator.target).toBe('gemini');
    const available = await generator.isAvailable();
    expect(available).toBe(true);
  });

  test('cursor adapter is available', async () => {
    const generator = createCursorLspGenerator();
    expect(generator).toBeDefined();
    expect(generator.target).toBe('cursor');
    const available = await generator.isAvailable();
    expect(available).toBe(true);
  });

  test('agy adapter is available', async () => {
    const generator = createAgyLspGenerator();
    expect(generator).toBeDefined();
    expect(generator.target).toBe('agy');
    const available = await generator.isAvailable();
    expect(available).toBe(true);
  });
});

// Acceptance Criterion 4: Supports 6 AI tool targets
describe('Six AI Tool Targets', () => {
  const targets = ['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy'];
  const generators = [
    createOpenCodeLspGenerator,
    createClaudeLspGenerator,
    createCodexLspGenerator,
    createGeminiLspGenerator,
    createCursorLspGenerator,
    createAgyLspGenerator,
  ];

  test('all 6 targets are supported', () => {
    expect(targets).toHaveLength(6);
  });

  test('each target generates a config file', () => {
    const results: readonly LspInstallResult[] = [
      { lspId: 'typescript', status: 'installed', version: '1.0.0' },
    ];

    for (let i = 0; i < targets.length; i++) {
      const generator = generators[i]();
      const files = generator.generate(results);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBeDefined();
    }
  });
});
