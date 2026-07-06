/**
 * CodeConductor configuration interface
 */
export interface CodeConductorConfig {
  version: string;
  project: {
    name: string;
    profile?: string;
  };
  defaults: {
    target: 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor' | 'agy';
    overwrite: boolean;
    locale: 'en' | 'es';
  };
  presets: {
    council: {
      enabled: boolean;
      version: string;
    };
  };
  safety: {
    destructiveCommands: string[];
    secretPatterns: string[];
    compileCheck?: {
      enabled: boolean;
      command?: string;
      timeoutMs?: number;
    };
  };
  loop?: {
    enabled?: boolean;
    maxIterations?: number;
    maxTokenBudget?: number;
  };
}

// Single source of truth — imported from credential-guard.ts.
// No runtime circular dependency: credential-guard.ts uses `import type` only.
import { DEFAULT_SECRET_PATTERNS } from '../filesystem/credential-guard';

/**
 * Default configuration.
 * `safety.secretPatterns` references `DEFAULT_SECRET_PATTERNS` from
 * credential-guard.ts so there is a single source of truth for default
 * credential patterns.
 */
export const DEFAULT_CONFIG: CodeConductorConfig = {
  version: '0.2.0',
  project: {
    name: 'unnamed-project',
  },
  defaults: {
    target: 'opencode',
    overwrite: false,
    locale: 'en',
  },
  presets: {
    council: {
      enabled: true,
      version: '0.1.0',
    },
  },
  safety: {
    destructiveCommands: ['rm -rf', 'drop table', 'delete from'],
    secretPatterns: DEFAULT_SECRET_PATTERNS,
    compileCheck: {
      enabled: true,
      command: 'tsc --noEmit',
      timeoutMs: 120_000,
    },
  },
  loop: {
    enabled: true,
    maxIterations: 3,
    maxTokenBudget: 0,
  },
};
