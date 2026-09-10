import type { AgentContract, ContractTarget } from '../../domain/council/agent-contract';
import type {
  AgentContractRenderResult,
  AgentContractRenderer,
} from '../../core/generation/agent-contract-renderer';
import { renderAgentContract } from '../../core/generation/agent-contract-renderer-base';
import { generateClaudeFiles } from './claude-council-generator';

/**
 * Renders an AgentContract into Claude Code's `.claude/` config structure.
 *
 * Wraps the existing `generateClaudeFiles()` and adds format validation.
 */
export class ClaudeAgentContractRenderer implements AgentContractRenderer {
  readonly target: ContractTarget = 'claude';

  render(contract: AgentContract): AgentContractRenderResult {
    return renderAgentContract(contract, {
      target: this.target,
      pathPrefix: '.claude/',
      generate: generateClaudeFiles,
      requiredDirs: ['/skills/', '/agents/'],
    });
  }
}
