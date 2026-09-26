import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ComplementaryToolsStatus {
  readonly rtk: boolean;
  readonly codeReviewGraph: boolean;
  readonly tokenSavior: boolean;
  readonly caveman: boolean;
  readonly engram: boolean;
  readonly gentleAi: boolean;
}

let cachedStatus: ComplementaryToolsStatus | null = null;

export async function detectComplementaryTools(): Promise<ComplementaryToolsStatus> {
  if (cachedStatus) {
    return cachedStatus;
  }

  const isCmdAvailable = async (cmd: string): Promise<boolean> => {
    try {
      // `cmd` is always a literal from detectComplementaryTools, never user input.
      const binary = process.platform === 'win32' ? 'where' : 'which';
      await execFileAsync(binary, [cmd], { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  };

  const hasCaveman = (): boolean => {
    try {
      const globalSettingsPath = join(homedir(), '.claude', 'settings.json');
      if (existsSync(globalSettingsPath)) {
        const content = readFileSync(globalSettingsPath, 'utf8');
        const settings = JSON.parse(content);
        if (settings.enabledPlugins && settings.enabledPlugins['caveman@caveman']) {
          return true;
        }
      }
    } catch {}

    try {
      const workspacePaths = [
        join(process.cwd(), '.claude', 'skills', 'caveman', 'SKILL.md'),
        join(process.cwd(), '.agents', 'skills', 'caveman', 'SKILL.md'),
      ];
      for (const p of workspacePaths) {
        if (existsSync(p)) return true;
      }
    } catch {}

    return false;
  };

  const [rtk, codeReviewGraph, tokenSavior, tokenSaviorRecall, engram, gentleAi] = await Promise.all([
    isCmdAvailable('rtk'),
    isCmdAvailable('code-review-graph'),
    isCmdAvailable('token-savior'),
    isCmdAvailable('token-savior-recall'),
    isCmdAvailable('engram'),
    isCmdAvailable('gentle-ai'),
  ]);

  cachedStatus = {
    rtk,
    codeReviewGraph,
    tokenSavior: tokenSavior || tokenSaviorRecall,
    caveman: hasCaveman(),
    engram,
    gentleAi,
  };

  return cachedStatus;
}

export function resetComplementaryToolsCache(): void {
  cachedStatus = null;
}
