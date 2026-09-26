import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';

/** Run the exact installed command through the platform's native shell. */
export function runHookShell(command: string, options: SpawnSyncOptionsWithStringEncoding) {
  const windows = process.platform === 'win32';
  return spawnSync(
    windows ? process.env.ComSpec ?? 'cmd.exe' : 'sh',
    windows ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command],
    { ...options, ...(windows ? { windowsVerbatimArguments: true } : {}) },
  );
}
