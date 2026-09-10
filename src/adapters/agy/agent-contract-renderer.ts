import type { AgentContract, ContractTarget } from '../../domain/council/agent-contract';
import type {
  AgentContractRenderResult,
  AgentContractRenderer,
} from '../../core/generation/agent-contract-renderer';
import { renderAgentContract } from '../../core/generation/agent-contract-renderer-base';
import { generateAgyFiles } from './agy-council-generator';

/**
 * Renders an AgentContract into Antigravity (agy) CLI's `.agents/` config structure.
 *
 * Wraps the existing `generateAgyFiles()` and adds format validation.
 */
export class AgyAgentContractRenderer implements AgentContractRenderer {
  readonly target: ContractTarget = 'agy';

  render(contract: AgentContract): AgentContractRenderResult {
    return renderAgentContract(contract, {
      target: this.target,
      pathPrefix: '.agents/',
      generate: generateAgyFiles,
      requiredDirs: ['/skills/', '/agents/'],
    });
  }
}
