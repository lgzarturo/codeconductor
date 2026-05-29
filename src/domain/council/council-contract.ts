/**
 * Output contract definitions for council generation
 */
export interface CouncilContract {
  readonly version: string;
  readonly targets: readonly string[];
}

/**
 * Contract for OpenCode output
 */
export const OPENCODECONTRACT: CouncilContract = {
  version: '1.0',
  targets: ['opencode'],
};

/**
 * Contract for Claude output
 */
export const CLAUDE_CONTRACT: CouncilContract = {
  version: '1.0',
  targets: ['claude'],
};

/**
 * Contract for Codex output
 */
export const CODEX_CONTRACT: CouncilContract = {
  version: '1.0',
  targets: ['codex'],
};

/**
 * All contracts
 */
export const ALL_CONTRACTS = [OPENCODECONTRACT, CLAUDE_CONTRACT, CODEX_CONTRACT];
