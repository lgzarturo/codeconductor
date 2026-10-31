import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Runs git with repo-configured command hooks disabled; null when git fails. */
export async function runGit(root: string, args: readonly string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
    });
    return stdout;
  } catch {
    return null;
  }
}
