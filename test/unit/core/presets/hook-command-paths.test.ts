import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildAbsoluteClaudeHookCommand,
  inspectClaudeHookCommandPaths,
  isRelativeClaudeHookCommand,
  parseClaudeHookCommand,
  rewriteClaudeHookCommandsForGlobal,
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
    const absolute = resolve(home, '.claude/hooks/invoke-hook.cjs').replace(/\\/g, '/');
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
    // Use a literal Windows path (do not path.resolve — on POSIX that would
    // treat the drive letter as a relative segment).
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

  test('inspect flags relative and missing absolute scripts', () => {
    const missing = join('/no/such', 'hooks', 'invoke-hook.cjs');
    const settings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              { type: 'command', command: 'node .claude/hooks/invoke-hook.cjs pre-tool' },
              { type: 'command', command: `node ${missing} pre-tool` },
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
          PreToolUse: [{ hooks: [{ type: 'command', command: `node ${script} pre-tool` }] }],
        },
      };
      expect(inspectClaudeHookCommandPaths(settings)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
