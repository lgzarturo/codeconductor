import type { AgentContract, ContractTarget } from '../../domain/council/agent-contract';
import type { GeneratedFile } from './generated-file';

/**
 * Result of rendering an AgentContract for a specific provider target
 */
export interface AgentContractRenderResult {
  readonly target: ContractTarget;
  readonly files: readonly GeneratedFile[];
  readonly allValid: boolean;
  readonly errors: readonly string[];
}

/**
 * Strategy interface for rendering an AgentContract into a provider-specific format.
 * Each provider adapter implements this interface.
 */
export interface AgentContractRenderer {
  /** The target provider this renderer handles */
  readonly target: ContractTarget;

  /** Render the contract into provider-native files */
  render(contract: AgentContract): AgentContractRenderResult;
}
