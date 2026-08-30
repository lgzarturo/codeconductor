import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  claudeExitCode,
  evaluatePreTool,
  formatHookOutput,
  formatSessionStart,
  parseAgyPayload,
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
  const trimmed = stdinText.trim();
  if (trimmed.startsWith('{')) return 'agy';
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

function resolvePreToolInput(options: HookOptions, stdinText: string): PreToolInput {
  const fromStdin = parseAgyPayload(stdinText);
  return {
    command:
      options.command ??
      process.env.CLAUDE_TOOL_INPUT_COMMAND ??
      fromStdin.command,
    filePath:
      options.filePath ??
      process.env.CLAUDE_TOOL_INPUT_FILE_PATH ??
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
    const filePath =
      options.filePath ?? process.env.CLAUDE_TOOL_INPUT_FILE_PATH ?? parseAgyPayload(stdinText).filePath;
    formatWrittenFile(filePath);
    if (format === 'agy') {
      process.stdout.write('{}\n');
    }
    return { code: 0, data: { success: true, command: 'hook post-tool' } };
  }

  const input = resolvePreToolInput(options, stdinText);
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
  return {
    code: claudeExitCode(verdict),
    data: { success: verdict.action !== 'deny', command: 'hook pre-tool', verdict },
  };
}

function formatWrittenFile(filePath: string | undefined): void {
  if (!filePath || !existsSync(filePath)) return;
  const prettier = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|scss|html|astro|ya?ml)$/i;
  const eslint = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
  const python = /\.py$/i;
  const opts = { stdio: 'ignore' as const, windowsHide: true };
  if (prettier.test(filePath)) {
    spawnSync('npx', ['--no-install', 'prettier', '--write', filePath], opts);
  }
  if (eslint.test(filePath)) {
    spawnSync('npx', ['--no-install', 'eslint', '--fix', filePath], opts);
  }
  if (python.test(filePath)) {
    spawnSync('ruff', ['format', filePath], opts);
    spawnSync('ruff', ['check', '--fix', filePath], opts);
  }
}
