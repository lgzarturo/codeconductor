import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import {
  claudeExitCode,
  evaluatePreTool,
  formatHookOutput,
  formatSessionStart,
  parseAgyPayload,
  parseClaudePayload,
  parseMusePayload,
  type HookEvent,
  type HookFormat,
  type PreToolInput,
} from '../core/hooks/hook-runner';
import type { OutputMode } from '../utils/logger';

export interface HookOptions {
  readonly event: HookEvent;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly format?: HookFormat;
  readonly command?: string;
  readonly filePath?: string;
  readonly stdinText?: string;
}

function detectFormat(explicit: HookFormat | undefined, stdinText: string): HookFormat {
  if (explicit) return explicit;
  try {
    const payload = JSON.parse(stdinText);
    if (payload && ('toolCall' in payload || 'toolName' in payload || 'workspacePaths' in payload)) return 'agy';
  } catch { /* Empty or malformed stdin uses the default host contract. */ }
  return 'claude';
}

export async function readStdinText(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function resolvePreToolInput(options: HookOptions, stdinText: string, format: HookFormat): PreToolInput {
  const fromStdin =
    format === 'agy'
      ? parseAgyPayload(stdinText)
      : format === 'muse'
        ? parseMusePayload(stdinText)
        : parseClaudePayload(stdinText);
  return {
    command:
      options.command ??
      (process.env.CLAUDE_TOOL_INPUT_COMMAND || undefined) ??
      fromStdin.command,
    filePath:
      options.filePath ??
      (process.env.CLAUDE_TOOL_INPUT_FILE_PATH || undefined) ??
      fromStdin.filePath,
    toolName: fromStdin.toolName,
  };
}

async function sessionLines(projectRoot: string): Promise<string[]> {
  const backlogPath = resolve(projectRoot, 'BACKLOG.md');
  const profilePath = resolve(projectRoot, '.codeconductor', 'evaluation', 'execution-profile.yml');
  return [
    '[CodeConductor] Session start',
    'Skills: openspec, backlog, evaluation, testing-tdd — invoke via /cc-* then CLI.',
    existsSync(backlogPath)
      ? 'BACKLOG.md present — run: bun run dev openspec status'
      : 'No BACKLOG.md — author with /cc-backlog if you need an item queue.',
    existsSync(profilePath)
      ? 'Scorecard profile on disk — run: bun run dev scorecard models'
      : 'Scorecard: bun run dev scorecard create --task <id> --from-diff',
    'Hooks: bun run dev hook pre-tool | post-tool | session-start',
    'Eval suites: bun run dev scorecard suite-run --suite workflow-gates',
  ];
}

export async function hookCommand(
  options: HookOptions
): Promise<{ code: number; data?: unknown }> {
  const event = options.event;
  const stdinText = options.stdinText ?? '';
  const format = detectFormat(options.format, stdinText);

  if (event === 'session-start') {
    const text = formatSessionStart(await sessionLines(options.projectRoot));
    process.stdout.write(`${text}\n`);
    return { code: 0, data: { success: true, command: 'hook session-start' } };
  }

  if (event === 'post-tool') {
    const filePath = resolvePreToolInput(options, stdinText, format).filePath;
    formatWrittenFile(filePath, options.projectRoot);
    if (format === 'agy') {
      process.stdout.write('{}\n');
    }
    return { code: 0, data: { success: true, command: 'hook post-tool' } };
  }

  const input = resolvePreToolInput(options, stdinText, format);
  const verdict = evaluatePreTool(input);

  if (format === 'agy') {
    process.stdout.write(`${formatHookOutput(verdict, 'agy')}\n`);
    return {
      code: 0,
      data: { success: verdict.action !== 'deny', command: 'hook pre-tool', verdict },
    };
  }

  if (verdict.action === 'deny') {
    process.stderr.write(`${verdict.message}\n`);
  }
  const output = formatHookOutput(verdict, 'claude');
  if (output) process.stdout.write(`${output}\n`);
  return {
    code: claudeExitCode(verdict),
    data: { success: verdict.action !== 'deny', command: 'hook pre-tool', verdict },
  };
}

function formatWrittenFile(filePath: string | undefined, projectRoot: string): void {
  if (!filePath) return;
  filePath = resolve(projectRoot, filePath);
  if (!existsSync(filePath)) return;
  const prettier = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|scss|html|astro|ya?ml)$/i;
  const eslint = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
  const python = /\.py$/i;
  const opts = { cwd: projectRoot, stdio: 'ignore' as const, windowsHide: true, timeout: 5000 };
  // Execute package JS entrypoints directly; npm's .cmd shims cannot be
  // spawned without a shell on Windows. Missing optional formatters are skipped.
  const require = createRequire(resolve(projectRoot, 'package.json'));
  function runNodeTool(name: string, args: string[]): void {
    try {
      const manifestPath = require.resolve(`${name}/package.json`);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[name];
      if (typeof bin === 'string') spawnSync(process.execPath, [resolve(dirname(manifestPath), bin), ...args], opts);
    } catch { /* The tool is optional and must be installed in the project. */ }
  }
  if (prettier.test(filePath)) {
    runNodeTool('prettier', ['--write', filePath]);
  }
  if (eslint.test(filePath)) {
    runNodeTool('eslint', ['--fix', filePath]);
  }
  if (python.test(filePath)) {
    spawnSync('ruff', ['format', filePath], opts);
    spawnSync('ruff', ['check', '--fix', filePath], opts);
  }
}
