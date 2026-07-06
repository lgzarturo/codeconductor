import type { CouncilSpec } from './council-spec';

/**
 * Supported provider targets for contract rendering
 */
export type ContractTarget = 'claude' | 'opencode' | 'codex' | 'gemini' | 'cursor' | 'agy';

/**
 * Contract format descriptor — a target plus optional render configuration
 */
export interface ContractFormat {
  readonly target: ContractTarget;
  readonly options?: Record<string, unknown>;
}

/**
 * Provider-agnostic agent contract definition.
 * Wraps a CouncilSpec with targeting and versioning metadata.
 */
export interface AgentContract {
  readonly council: CouncilSpec;
  readonly targets: readonly ContractFormat[];
  readonly contractVersion: string;
  readonly renderHints?: Partial<Record<ContractTarget, Record<string, unknown>>>;
}

/**
 * Factory for creating an AgentContract with defaults
 */
export function createAgentContract(
  council: CouncilSpec,
  targets: readonly ContractFormat[],
  contractVersion = '1.0.0',
  renderHints?: Partial<Record<ContractTarget, Record<string, unknown>>>,
): AgentContract {
  return { council, targets, contractVersion, renderHints };
}
