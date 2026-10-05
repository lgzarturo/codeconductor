/**
 * Compile Check — runs a build command via node:child_process, captures output,
 * parses errors, and returns structured results for re-injection.
 */

import { spawn, type ChildProcess } from 'node:child_process';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompileError {
  file: string;
  line?: number;
  column?: number;
  code: string;
  message: string;
  raw: string;
}

export interface CompileResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  errors: CompileError[];
  durationMs: number;
  timedOut: boolean;
  skipped?: boolean;
  skipReason?: string;
}

export interface CompileCheckOptions {
  /**
   * Shell command to run (string or pre-split args). Default: `tsc --noEmit`.
   * Must be a project-trusted compile command from config, never unsanitized CLI input.
   */
  command?: string | string[];
  /** Working directory. Default: process.cwd() */
  cwd?: string;
  /** Timeout in milliseconds. Default: 120 000 (2 min) */
  timeoutMs?: number;
}

const DEFAULT_COMMAND: string | string[] = 'tsc --noEmit';
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Tokenize a shell command string, respecting single and double quotes.
 *
 * Exported so other modules that must spawn configured commands (e.g. the
 * regression checklist) can avoid invoking a shell entirely.
 */
export function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
    } else if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else {
        current += ch;
      }
    } else if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Compile commands that may run without `--allow-compile-check`.
 *
 * Matching is token-prefix on a path-free argv[0] so `./evil` or
 * `/tmp/tsc` never slip through as "tsc". Extra flags after the prefix
 * are allowed (`tsc --noEmit`, `bun run typecheck`).
 */
const ALLOWLISTED_ARGV_PREFIXES: readonly (readonly string[])[] = [
  ['tsc'],
  ['bun', 'run'],
  ['bun', 'test'],
  ['npm', 'test'],
  ['npm', 'run'],
  ['npx', 'tsc'],
  ['pnpm', 'test'],
  ['pnpm', 'run'],
  ['yarn', 'test'],
  ['yarn', 'run'],
];

export function isAllowlistedCompileCommand(command: string | string[]): boolean {
  const parts = Array.isArray(command) ? command : tokenizeCommand(command);
  if (parts.length === 0) return false;
  const bin = parts[0]!;
  if (bin.includes('/') || bin.includes('\\')) return false;
  return ALLOWLISTED_ARGV_PREFIXES.some(
    (prefix) =>
      parts.length >= prefix.length &&
      prefix.every((token, i) => parts[i] === token),
  );
}

/** Allowlisted commands that actually run a test suite (`bun test`, `npm test`, …). */
export function isAllowlistedTestCommand(command: string | string[]): boolean {
  if (!isAllowlistedCompileCommand(command)) return false;
  const parts = Array.isArray(command) ? command : tokenizeCommand(command);
  return parts.some((token) => token === 'test' || token.startsWith('test:'));
}

/**
 * Minimal environment for compile-check child processes.
 *
 * The compile command comes from the analyzed project's own config, so the
 * child must not inherit secrets (API keys, cloud credentials) from
 * `process.env`. Only what a compiler needs to run is forwarded.
 */
function minimalChildEnv(): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    NODE_NO_WARNINGS: '1',
  };
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.platform === 'win32') {
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    if (process.env.USERPROFILE) env.USERPROFILE = process.env.USERPROFILE;
  }
  return env;
}

// ─── Error parsers ───────────────────────────────────────────────────────────

/**
 * Parse TypeScript compiler errors.
 * Format: `file(line, col): error TSxxxx: message`
 * Also handles: `file: line, col: error TSxxxx: message`
 */
function parseTypeScriptErrors(stderr: string): CompileError[] {
  const errors: CompileError[] = [];
  // Match: path(line,col): error TSxxxx: message
  //        path(line): error TSxxxx: message
  const tsRegex =
    /^(.+?)\((\d+)(?:,\s*(\d+))?\)\s*:\s*error\s+(TS\d+):\s*(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = tsRegex.exec(stderr)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: match[3] ? parseInt(match[3], 10) : undefined,
      code: match[4],
      message: match[5],
      raw: match[0],
    });
  }
  return errors;
}

/**
 * Parse ESLint errors.
 * Format: `file:line:col:  message  severity  rule-id`
 *         `file:line:col:  message  severity`
 */
function parseEslintErrors(stderr: string): CompileError[] {
  const errors: CompileError[] = [];
  // Match: path:line:col:  message  error|warning  rule-id (rule-id optional)
  const eslintRegex =
    /^(.+?):(\d+):(\d+):\s+(.+?)\s+(error|warning)(?:\s+(\S+))?\s*$/gm;

  let match: RegExpExecArray | null;
  while ((match = eslintRegex.exec(stderr)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: match[6],
      message: match[4],
      raw: match[0],
    });
  }
  return errors;
}

/**
 * Generic error parser — catches `path:line:col: message` and `path: message` patterns.
 */
function parseGenericErrors(stderr: string): CompileError[] {
  const errors: CompileError[] = [];
  // path:line:col: message
  const withPosRegex = /^(.+?):(\d+):(\d+):\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = withPosRegex.exec(stderr)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: '',
      message: match[4],
      raw: match[0],
    });
  }

  // path: line: message (no column — space after colon distinguishes from line:col:)
  const withLineOnlyRegex = /^(.+?):\s+(\d+):\s+(.+)$/gm;
  while ((match = withLineOnlyRegex.exec(stderr)) !== null) {
    // Skip if already captured by withPosRegex
    const already = errors.some(
      (e) =>
        e.file === match![1] &&
        e.line === parseInt(match![2], 10)
    );
    if (!already) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        code: '',
        message: match[3],
        raw: match[0],
      });
    }
  }

  // path: message (no line)
  if (errors.length === 0) {
    const plainRegex = /^(.+?):\s+(.+)$/gm;
    while ((match = plainRegex.exec(stderr)) !== null) {
      errors.push({
        file: match[1],
        code: '',
        message: match[2],
        raw: match[0],
      });
    }
  }

  return errors;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse compile stderr output into structured CompileError[].
 * Tries TypeScript format first, then ESLint, then generic.
 */
export function parseCompileErrors(stderr: string): CompileError[] {
  if (!stderr || !stderr.trim()) return [];

  // Try TypeScript first (most specific)
  const tsErrors = parseTypeScriptErrors(stderr);
  if (tsErrors.length > 0) return tsErrors;

  // Try ESLint
  const eslintErrors = parseEslintErrors(stderr);
  if (eslintErrors.length > 0) return eslintErrors;

  // Fall back to generic
  return parseGenericErrors(stderr);
}

/**
 * Run a compile check with configurable timeout. Uses `node:child_process`
 * because the published bundle runs under Node (`npx cc-codeconductor`).
 */
export async function runCompileCheck(
  options?: CompileCheckOptions
): Promise<CompileResult> {
  const command = options?.command ?? DEFAULT_COMMAND;
  const cwd = options?.cwd ?? process.cwd();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const startTime = performance.now();
  let timedOut = false;

  const parts = Array.isArray(command) ? command : tokenizeCommand(command);

  const failure = (stderr: string): CompileResult => ({
    success: false,
    exitCode: -1,
    stdout: '',
    stderr,
    errors: [],
    durationMs: performance.now() - startTime,
    timedOut: false,
  });

  let proc: ChildProcess;
  try {
    proc = spawn(parts[0]!, parts.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: minimalChildEnv(),
      // On POSIX this creates a process group so timeout cleanup can terminate
      // descendants as well as the direct child.
      detached: process.platform !== 'win32',
    });
  } catch (err) {
    return failure(String(err));
  }

  // Reading both pipes to completion is what keeps the child from blocking on a
  // full buffer, but it only settles once the child exits — so it is raced
  // against the timeout instead of relying on a timer to interrupt it.
  const collectOutput = new Promise<{ stdout: string; stderr: string; exitCode: number }>(
    (resolvePromise) => {
      let stdout = '';
      let stderr = '';
      proc.stdout!.setEncoding('utf-8').on('data', (chunk: string) => (stdout += chunk));
      proc.stderr!.setEncoding('utf-8').on('data', (chunk: string) => (stderr += chunk));
      // A spawn failure (e.g. ENOENT) surfaces as an event, not a throw.
      proc.on('error', (err) =>
        resolvePromise({ stdout: '', stderr: String(err), exitCode: -1 }),
      );
      proc.on('close', (code, signal) =>
        resolvePromise({ stdout, stderr, exitCode: code ?? (signal ? -1 : 0) }),
      );
    },
  );

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolvePromise) => {
    timeoutId = setTimeout(() => resolvePromise('timeout'), timeoutMs);
  });

  try {
    const outcome = await Promise.race([collectOutput, timeout]);

    if (outcome === 'timeout') {
      timedOut = true;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          process.kill(-proc.pid!, 'SIGKILL');
        }
      } catch {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process may have already exited.
        }
      }

      return {
        success: false,
        exitCode: proc.exitCode ?? -1,
        stdout: '',
        stderr: `Compile check timed out after ${timeoutMs}ms`,
        errors: [],
        durationMs: performance.now() - startTime,
        timedOut,
      };
    }

    return {
      success: outcome.exitCode === 0,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      errors: parseCompileErrors(outcome.stderr),
      durationMs: performance.now() - startTime,
      timedOut,
    };
  } catch (err) {
    return { ...failure(String(err)), timedOut };
  } finally {
    clearTimeout(timeoutId);
  }
}
