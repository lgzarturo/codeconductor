import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ComplementaryToolsStatus {
  readonly rtk: boolean;
  readonly codeReviewGraph: boolean;
  readonly tokenSavior: boolean;
  readonly caveman: boolean;
  readonly engram: boolean;
  readonly gentleAi: boolean;
}

let cachedStatus: ComplementaryToolsStatus | null = null;

export function detectComplementaryTools(): ComplementaryToolsStatus {
  if (cachedStatus) {
    return cachedStatus;
  }

  const isCmdAvailable = (cmd: string): boolean => {
    try {
      const command = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
      execSync(command, { stdio: 'ignore', timeout: 1000 });
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

  cachedStatus = {
    rtk: isCmdAvailable('rtk'),
    codeReviewGraph: isCmdAvailable('code-review-graph'),
    tokenSavior: isCmdAvailable('token-savior') || isCmdAvailable('token-savior-recall'),
    caveman: hasCaveman(),
    engram: isCmdAvailable('engram'),
    gentleAi: isCmdAvailable('gentle-ai'),
  };

  return cachedStatus;
}

export function resetComplementaryToolsCache(): void {
  cachedStatus = null;
}
