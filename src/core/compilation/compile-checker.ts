/**
 * Compile Check — runs a build command via Bun.spawn, captures output,
 * parses errors, and returns structured results for re-injection.
 */

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
 */
function tokenizeCommand(cmd: string): string[] {
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
 * Run a compile check via Bun.spawn with configurable timeout.
 */
export async function runCompileCheck(
  options?: CompileCheckOptions
): Promise<CompileResult> {
  const command = options?.command ?? DEFAULT_COMMAND;
  const cwd = options?.cwd ?? process.cwd();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const startTime = performance.now();
  let timedOut = false;

  // Parse command into parts for Bun.spawn
  const parts = Array.isArray(command) ? command : tokenizeCommand(command);

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(parts, {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      // On POSIX this creates a process group so timeout cleanup can terminate
      // descendants as well as the direct child.
      detached: process.platform !== 'win32',
    });
  } catch (err) {
    const durationMs = performance.now() - startTime;
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: String(err),
      errors: [],
      durationMs,
      timedOut: false,
    };
  }

  // Reading both pipes to completion is what keeps the child from blocking on a
  // full buffer, but it only settles once the child exits — so it is raced
  // against the timeout instead of relying on a timer to interrupt it.
  const collectOutput = (async () => {
    const stdoutStream = proc.stdout as ReadableStream<Uint8Array>;
    const stderrStream = proc.stderr as ReadableStream<Uint8Array>;
    const [stdout, stderr] = await Promise.all([
      new Response(stdoutStream).text(),
      new Response(stderrStream).text(),
    ]);
    return { stdout, stderr, exitCode: await proc.exited };
  })();
  collectOutput.catch(() => {
    // Swallowed here so a post-timeout rejection is never unhandled.
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    const outcome = await Promise.race([collectOutput, timeout]);

    if (outcome === 'timeout') {
      timedOut = true;
      try {
        if (process.platform === 'win32') {
          const taskkill = Bun.spawn(
            ['taskkill', '/PID', String(proc.pid), '/T', '/F'],
            { stdout: 'ignore', stderr: 'ignore' },
          );
          await taskkill.exited;
        } else {
          process.kill(-proc.pid, 'SIGKILL');
        }
      } catch {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process may have already exited.
        }
      }
      await proc.exited;

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
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: String(err),
      errors: [],
      durationMs: performance.now() - startTime,
      timedOut,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
