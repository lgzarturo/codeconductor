import type { AgentContract, ContractTarget } from '../../domain/council/agent-contract';
import type {
  AgentContractRenderResult,
  AgentContractRenderer,
} from '../../core/generation/agent-contract-renderer';
import { renderAgentContract } from '../../core/generation/agent-contract-renderer-base';
import { generateCodexFiles } from './codex-council-generator';

/**
 * Renders an AgentContract into Codex CLI's `.codex/` config structure.
 *
 * Wraps the existing `generateCodexFiles()` and adds format validation.
 */
export class CodexAgentContractRenderer implements AgentContractRenderer {
  readonly target: ContractTarget = 'codex';

  render(contract: AgentContract): AgentContractRenderResult {
    return renderAgentContract(contract, {
      target: this.target,
      pathPrefix: '.codex/',
      generate: generateCodexFiles,
      requiredDirs: ['/skills/', '/agents/'],
    });
  }
}
