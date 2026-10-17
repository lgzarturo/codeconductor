import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildAbsoluteClaudeHookCommand,
  escapeHookPathForDoubleQuotes,
  inspectClaudeHookCommandPaths,
  isRelativeClaudeHookCommand,
  normalizeHookScriptPath,
  parseClaudeHookCommand,
  quoteHookPath,
  rewriteClaudeHookCommandsForGlobal,
  unescapeHookPathFromDoubleQuotes,
} from '../../../../src/core/presets/hook-command-paths';

describe('hook-command-paths', () => {
  test('detects relative Claude hook commands', () => {
    expect(isRelativeClaudeHookCommand('node .claude/hooks/invoke-hook.cjs pre-tool')).toBe(true);
    expect(isRelativeClaudeHookCommand('node "./.claude/hooks/invoke-hook.cjs" post-tool')).toBe(true);
    expect(isRelativeClaudeHookCommand('node /home/u/.claude/hooks/invoke-hook.cjs pre-tool')).toBe(false);
  });

  test('rewrites relative global hooks to absolute paths and is idempotent', () => {
    const home = '/tmp/cc-home-example';
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'node .claude/hooks/invoke-hook.cjs pre-tool' }],
          },
        ],
        SessionStart: [
          {
            hooks: [{ type: 'command', command: 'node .claude/hooks/invoke-hook.cjs session-start' }],
          },
        ],
      },
    };

    const first = rewriteClaudeHookCommandsForGlobal(settings, home);
    expect(first.changes).toHaveLength(2);
    const absolute = normalizeHookScriptPath(resolve(home, '.claude/hooks/invoke-hook.cjs'));
    expect(buildAbsoluteClaudeHookCommand(absolute, 'pre-tool')).toBe(`node ${absolute} pre-tool`);

    const pre = (first.settings.hooks as { PreToolUse: Array<{ hooks: Array<{ command: string }> }> })
      .PreToolUse[0].hooks[0].command;
    expect(pre).toBe(`node ${absolute} pre-tool`);
    expect(isRelativeClaudeHookCommand(pre)).toBe(false);

    const second = rewriteClaudeHookCommandsForGlobal(first.settings, home);
    expect(second.changes).toHaveLength(0);
    expect(second.settings).toEqual(first.settings);
  });

  test('Windows-style absolute paths are written with forward slashes and remain parseable', () => {
    // Literal Windows path — do not path.resolve on POSIX (drive letter becomes relative).
    const winScript = 'C:\\Users\\runner\\AppData\\Local\\Temp\\cc-home\\.claude\\hooks\\invoke-hook.cjs';
    const command = buildAbsoluteClaudeHookCommand(winScript, 'pre-tool');
    expect(command).toBe(
      'node C:/Users/runner/AppData/Local/Temp/cc-home/.claude/hooks/invoke-hook.cjs pre-tool'
    );
    expect(command).not.toContain('\\');
    expect(parseClaudeHookCommand(command)?.script).toBe(
      'C:/Users/runner/AppData/Local/Temp/cc-home/.claude/hooks/invoke-hook.cjs'
    );
  });

  test('paths with spaces are double-quoted and round-trip through parse', () => {
    const script = '/tmp/my home/.claude/hooks/invoke-hook.cjs';
    expect(quoteHookPath(script)).toBe('"/tmp/my home/.claude/hooks/invoke-hook.cjs"');
    const command = buildAbsoluteClaudeHookCommand(script, 'post-tool');
    expect(command).toBe('node "/tmp/my home/.claude/hooks/invoke-hook.cjs" post-tool');
    expect(parseClaudeHookCommand(command)).toEqual({
      runner: 'node',
      script,
      rest: 'post-tool',
    });
  });

  test('shell metacharacters in the path are escaped inside double quotes', () => {
    const script = '/tmp/$(id)`whoami`/.claude/hooks/invoke-hook.cjs';
    const quoted = quoteHookPath(script);
    expect(quoted.startsWith('"')).toBe(true);
    expect(quoted).toContain('\\$');
    expect(quoted).toContain('\\`');
    // Unescaped $() / backticks must not appear inside the quotes.
    expect(quoted).not.toMatch(/[^\\]\$\(/);
    expect(quoted).not.toMatch(/[^\\]`/);

    const command = buildAbsoluteClaudeHookCommand(script, 'pre-tool');
    expect(command).toBe(`node ${quoted} pre-tool`);
    expect(parseClaudeHookCommand(command)?.script).toBe(script);

    expect(unescapeHookPathFromDoubleQuotes(escapeHookPathForDoubleQuotes(script))).toBe(script);
  });

  test('rewrite leaves non-CodeConductor hook commands untouched', () => {
    const foreign = 'python3 /opt/custom/pretool.py';
    const otherNode = 'node /opt/other/hooks/something.cjs pre-tool';
    const settings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              { type: 'command', command: 'node .claude/hooks/invoke-hook.cjs pre-tool' },
              { type: 'command', command: foreign },
              { type: 'command', command: otherNode },
            ],
          },
        ],
      },
    };

    const { settings: rewritten, changes } = rewriteClaudeHookCommandsForGlobal(settings, '/tmp/cc-home');
    expect(changes).toHaveLength(1);
    const commands = (
      rewritten.hooks as { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }
    ).PreToolUse[0].hooks.map((h) => h.command);
    expect(commands[1]).toBe(foreign);
    expect(commands[2]).toBe(otherNode);
    expect(parseClaudeHookCommand(foreign)).toBeNull();
    expect(parseClaudeHookCommand(otherNode)).toBeNull();
  });

  test('inspect flags relative and missing absolute scripts', () => {
    const missing = join('/no/such', '.claude', 'hooks', 'invoke-hook.cjs');
    const settings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              { type: 'command', command: 'node .claude/hooks/invoke-hook.cjs pre-tool' },
              { type: 'command', command: `node ${normalizeHookScriptPath(missing)} pre-tool` },
            ],
          },
        ],
      },
    };
    const issues = inspectClaudeHookCommandPaths(settings);
    expect(issues.map((i) => i.reason).sort()).toEqual(['missing', 'relative']);
  });

  test('inspect passes when absolute script exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-hook-path-'));
    try {
      const script = join(root, '.claude', 'hooks', 'invoke-hook.cjs');
      mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
      writeFileSync(script, 'module.exports = {};');
      const settings = {
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: `node ${normalizeHookScriptPath(script)} pre-tool` }] }],
        },
      };
      expect(inspectClaudeHookCommandPaths(settings)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
