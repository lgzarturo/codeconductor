import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { evaluateCommand, evaluateRoleAccess, formatHookOutput, parseAgyPayload } from '../src/core/hooks/hook-runner';

const ROOT = resolve(import.meta.dir, '..');
const HOOK = join(ROOT, 'presets/shared/invoke-hook.cjs');

function invoke(payload: unknown, format?: string) {
  return spawnSync('bun', ['run', join(ROOT, 'src/cli/main.ts'), 'hook', 'pre-tool', ...(format ? [`--format=${format}`] : [])], {
    cwd: ROOT, input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, CLAUDE_TOOL_INPUT_COMMAND: '', CLAUDE_TOOL_INPUT_FILE_PATH: '' },
  });
}

describe('hook host contracts and portability', () => {
  test('Claude stdin blocks a destructive command without custom environment variables', () => {
    const result = invoke({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('autoridad');
  });

  test('Claude asks for confirmation through its native JSON contract', () => {
    const result = invoke({ tool_name: 'Bash', tool_input: { command: 'git commit -m example' } });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
  });

  test('Claude evaluates sensitive read paths', () => {
    expect(invoke({ tool_name: 'Read', tool_input: { file_path: 'C:\\project\\.env' } }).status).toBe(2);
  });

  test('Antigravity accepts the documented toolCall payload', () => {
    expect(parseAgyPayload(JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: 'git push', Cwd: 'C:\\project' } } }))).toEqual({
      toolName: 'run_command', command: 'git push', filePath: undefined,
    });
    const result = invoke({ toolCall: { name: 'view_file', args: { AbsolutePath: 'C:\\project\\.env' } } }, 'agy');
    expect(JSON.parse(result.stdout).decision).toBe('deny');
  });

  test('Antigravity explains denials using reason', () => {
    expect(JSON.parse(formatHookOutput(evaluateCommand('git push'), 'agy')).reason).toContain('autoridad');
  });

  test('empty, malformed and legacy Antigravity payloads remain safe to parse', () => {
    for (const input of ['', '{', 'null', '[]']) expect(parseAgyPayload(input)).toEqual({});
    expect(parseAgyPayload('{"toolName":"run_command","arguments":{"CommandLine":"git status"}}').command).toBe('git status');
  });

  for (const command of ['C:\\Git\\bin\\git.exe push', '"C:\\Program Files\\Git\\bin\\git.exe" push', '& "C:\\Program Files\\Git\\bin\\git.exe" reset --hard', '/usr/bin/git push', 'git -C "C:\\project" push', 'git status && git push']) {
    test(`blocks ${command}`, () => expect(evaluateCommand(command).action).toBe('deny'));
  }

  test('Windows separators preserve role restrictions', () => {
    expect(evaluateRoleAccess('implementer', 'C:\\project\\tests\\example.ts').allowed).toBe(false);
    expect(evaluateRoleAccess('tester', 'C:\\project\\tests\\example.ts').allowed).toBe(true);
    expect(evaluateRoleAccess('architect', 'C:\\project\\docs\\diagram.json').allowed).toBe(true);
    expect(evaluateRoleAccess('tester', 'C:\\project\\src\\example.ts').allowed).toBe(false);
    expect(evaluateRoleAccess('implementer', 'C:\\project\\Tests\\example.ts').allowed).toBe(false);
  });

  test('native Windows recursive deletion commands obey the destructive-path policy', () => {
    for (const command of ['Remove-Item -Recurse -Force C:\\project', 'rd /s /q C:\\project', 'del /s /q C:\\project\\*']) {
      expect(evaluateCommand(command).action).toBe('deny');
    }
    expect(evaluateCommand('Remove-Item -LiteralPath build.log').action).toBe('allow');
    expect(evaluateCommand('Get-Content src\\file.ts').action).toBe('allow');
  });

  test('fallback runners receive the original stdin after an earlier runner consumes it', () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-hook-replay-'));
    try {
      mkdirSync(join(root, 'src/cli'), { recursive: true });
      mkdirSync(join(root, 'node_modules/cc-codeconductor/dist'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}');
      writeFileSync(join(root, 'src/cli/main.ts'), "import {readFileSync} from 'node:fs'; readFileSync(0, 'utf8'); process.exit(1);");
      writeFileSync(join(root, 'node_modules/cc-codeconductor/dist/index.js'), "const raw=require('node:fs').readFileSync(0,'utf8'); process.stdout.write(JSON.stringify({decision:raw.includes('git push')?'deny':'allow'}));");
      const result = spawnSync('node', [HOOK, 'pre-tool', '--format=agy'], { cwd: root, env: { ...process.env, PROJECT_ROOT: root }, input: '{"command":"git push"}', encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).decision).toBe('deny');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  for (const format of ['claude', 'agy']) {
    test(`${format} post-tool reads its host payload and runs a local JS formatter`, () => {
      const root = mkdtempSync(join(tmpdir(), 'cc-formatter-'));
      try {
        mkdirSync(join(root, 'node_modules/prettier'), { recursive: true });
        writeFileSync(join(root, 'package.json'), '{}');
        writeFileSync(join(root, 'node_modules/prettier/package.json'), '{"name":"prettier","bin":{"prettier":"cli.cjs"}}');
        writeFileSync(join(root, 'node_modules/prettier/cli.cjs'), "require('node:fs').writeFileSync(process.argv.at(-1), 'formatted');");
        writeFileSync(join(root, 'file with spaces.md'), 'unformatted');
        const payload = format === 'claude'
          ? { tool_name: 'Write', tool_input: { file_path: 'file with spaces.md' } }
          : { toolCall: { name: 'write_to_file', args: { TargetFile: 'file with spaces.md' } } };
        const result = spawnSync('bun', ['run', join(ROOT, 'src/cli/main.ts'), 'hook', 'post-tool', `--format=${format}`], {
          cwd: root, input: JSON.stringify(payload), encoding: 'utf8',
          env: { ...process.env, CLAUDE_TOOL_INPUT_FILE_PATH: '' },
        });
        expect(result.status).toBe(0);
        expect(readFileSync(join(root, 'file with spaces.md'), 'utf8')).toBe('formatted');
        expect(result.stdout.trim()).toBe(format === 'agy' ? '{}' : '');
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
});

describe('preset configuration validation', () => {
  test('Claude starts in default permission mode', () => {
    const settings = JSON.parse(readFileSync(join(ROOT, 'presets/claude/settings.json'), 'utf8'));
    expect(settings.permissions.defaultMode).toBe('default');
  });

});
