import { spawn } from 'bun';
import { format } from 'node:util';
import { join, resolve } from 'node:path';
import { executeCli } from '../../src/cli/execute';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const MAIN_TS = join(PROJECT_ROOT, 'src/cli/main.ts');

export interface CliRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

let captureLock: Promise<void> = Promise.resolve();

/**
 * Invoke the CLI in-process (no Bun cold start). `args` are command tokens
 * (`init --force`), not a full argv. `cwd` is the project root passed to
 * `routeCommand`.
 */
export async function invokeCli(args: string[], cwd: string): Promise<CliRunResult> {
  let release!: () => void;
  const prev = captureLock;
  captureLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  const logs: string[] = [];
  const errs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => {
    logs.push(`${format(...a)}\n`);
  };
  console.error = (...a: unknown[]) => {
    errs.push(`${format(...a)}\n`);
  };
  try {
    const exitCode = await executeCli(args, cwd);
    return { exitCode, stdout: logs.join(''), stderr: errs.join('') };
  } finally {
    console.log = origLog;
    console.error = origErr;
    release();
  }
}

/**
 * Spawn `src/cli/main.ts` as a real process. Keep for 1–2 smokes that
 * `process.exit` and argv slicing still work.
 */
export async function spawnCli(args: string[], cwd: string): Promise<CliRunResult> {
  const child = spawn({
    cmd: [process.execPath, 'run', MAIN_TS, ...args],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  return { exitCode, stdout, stderr };
}
