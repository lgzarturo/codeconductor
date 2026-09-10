import type { AgentContract, ContractTarget } from '../../domain/council/agent-contract';
import type {
  AgentContractRenderResult,
  AgentContractRenderer,
} from '../../core/generation/agent-contract-renderer';
import { renderAgentContract } from '../../core/generation/agent-contract-renderer-base';
import { generateOpenCodeFiles } from './opencode-council-generator';

/**
 * Renders an AgentContract into OpenCode's `.opencode/` config structure.
 *
 * Wraps the existing `generateOpenCodeFiles()` and adds format validation.
 */
export class OpenCodeAgentContractRenderer implements AgentContractRenderer {
  readonly target: ContractTarget = 'opencode';

  render(contract: AgentContract): AgentContractRenderResult {
    return renderAgentContract(contract, {
      target: this.target,
      pathPrefix: '.opencode/',
      generate: generateOpenCodeFiles,
      requiredDirs: ['/commands/', '/agents/'],
      requireFrontmatterFence: ['/commands/', '/agents/'],
    });
  }
}
