import { describe, expect, test } from 'bun:test';
import {
  evaluatePreTool,
  formatHookOutput,
  parseMusePayload,
} from '../../../../src/core/hooks/hook-runner';
import { parseHookFormat } from '../../../../src/commands/hook.command';

const MUSE_PRETOOL_FIXTURE = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'bash',
  tool_input: { command: 'git push origin main' },
});

describe('core/hooks/muse-hook-format', () => {
  test('happy path: parses the documented muse PreToolUse payload', () => {
    expect(parseMusePayload(MUSE_PRETOOL_FIXTURE)).toEqual({
      ok: true,
      input: {
        toolName: 'bash',
        command: 'git push origin main',
        filePath: undefined,
      },
    });
  });

  test('happy path: reads file_path for file tools', () => {
    const parsed = parseMusePayload(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'read',
        tool_input: { file_path: '.env' },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.input.filePath).toBe('.env');
      expect(parsed.input.toolName).toBe('read');
    }
  });

  test('edge case: empty and malformed stdin fail closed', () => {
    for (const raw of ['', '   ', '{', 'null', '[]']) {
      expect(parseMusePayload(raw).ok).toBe(false);
    }
  });

  test('edge case: payload without tool fields yields no command or path', () => {
    expect(parseMusePayload(JSON.stringify({ hook_event_name: 'PreToolUse' }))).toEqual({
      ok: true,
      input: {
        toolName: undefined,
        command: undefined,
        filePath: undefined,
      },
    });
  });

  test('contract: a destructive muse command evaluates to deny', () => {
    const parsed = parseMusePayload(MUSE_PRETOOL_FIXTURE);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(evaluatePreTool(parsed.input).action).toBe('deny');
  });

  test('contract: ask verdicts use the permission-decision output', () => {
    const output = formatHookOutput(
      { action: 'ask', message: 'confirm', exitCode: 0 },
      'muse',
    );
    expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe('ask');
  });

  test('contract: allow and deny verdicts emit no output body (exit code carries them)', () => {
    expect(formatHookOutput({ action: 'allow', message: '', exitCode: 0 }, 'muse')).toBe('');
    expect(formatHookOutput({ action: 'deny', message: 'no', exitCode: 2 }, 'muse')).toBe('');
  });

  test('regression (W1): --format=muse is accepted, not silently dropped', () => {
    expect(parseHookFormat('muse')).toBe('muse');
  });

  test('regression (W1): known formats pass through, unknown values are rejected', () => {
    expect(parseHookFormat('claude')).toBe('claude');
    expect(parseHookFormat('agy')).toBe('agy');
    expect(parseHookFormat('bogus')).toBeUndefined();
    expect(parseHookFormat(undefined)).toBeUndefined();
  });
});
