import type {
  AgentContract,
  ContractTarget,
} from '../../domain/council/agent-contract';
import type {
  AgentContractRenderResult,
  AgentContractRenderer,
} from '../../core/generation/agent-contract-renderer';
import type { GeneratedFile } from '../../core/generation/generated-file';
import { generateClaudeFiles } from './claude-council-generator';
import { CouncilSpecSchema } from '../../validation/schemas';

/**
 * Validates that generated Claude files follow expected patterns:
 * - Paths must start with .claude/
 * - At least one skill file must exist
 * - Agent files must follow .claude/agents/council-*.md pattern
 */
function validateClaudeFiles(files: readonly GeneratedFile[]): string[] {
  const errors: string[] = [];

  for (const file of files) {
    if (!file.path.startsWith('.claude/')) {
      errors.push(`Claude file path must start with .claude/: ${file.path}`);
    }
    if (typeof file.content !== 'string' || file.content.length === 0) {
      errors.push(`Claude file content must be a non-empty string: ${file.path}`);
    }
  }

  const hasSkill = files.some((f) => f.path.includes('/skills/'));
  if (!hasSkill && files.length > 0) {
    errors.push('Claude output must include at least one skill file (.claude/skills/)');
  }

  const hasAgent = files.some((f) => f.path.includes('/agents/'));
  if (!hasAgent && files.length > 0) {
    errors.push('Claude output must include at least one agent file (.claude/agents/)');
  }

  return errors;
}

/**
 * Renders an AgentContract into Claude Code's `.claude/` config structure.
 *
 * Wraps the existing `generateClaudeFiles()` and adds format validation.
 */
export class ClaudeAgentContractRenderer implements AgentContractRenderer {
  readonly target: ContractTarget = 'claude';

  render(contract: AgentContract): AgentContractRenderResult {
    // Validate that the contract's council is a valid CouncilSpec
    const councilValidation = CouncilSpecSchema.safeParse(contract.council);
    if (!councilValidation.success) {
      return {
        target: this.target,
        files: [],
        allValid: false,
        errors: [
          `Invalid CouncilSpec: ${councilValidation.error.issues.map((i) => i.message).join(', ')}`,
        ],
      };
    }

    // Check that this target is in the contract's target list
    const hasTarget = contract.targets.some((t) => t.target === this.target);
    if (!hasTarget) {
      return {
        target: this.target,
        files: [],
        allValid: false,
        errors: [`Contract does not include target: ${this.target}`],
      };
    }

    // Delegate to existing generator
    const files = generateClaudeFiles(contract.council);

    // Validate generated output
    const validationErrors = validateClaudeFiles(files);

    return {
      target: this.target,
      files,
      allValid: validationErrors.length === 0,
      errors: validationErrors,
    };
  }
}
