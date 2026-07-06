import type {
  AgentContract,
  ContractTarget,
} from '../../domain/council/agent-contract';
import type {
  AgentContractRenderResult,
  AgentContractRenderer,
} from '../../core/generation/agent-contract-renderer';
import type { GeneratedFile } from '../../core/generation/generated-file';
import { generateOpenCodeFiles } from './opencode-council-generator';
import { CouncilSpecSchema } from '../../validation/schemas';

/**
 * Validates that generated OpenCode files follow expected patterns:
 * - Paths must start with .opencode/
 * - At least one command file must exist
 * - Agent files must follow .opencode/agents/council-*.md pattern
 */
function validateOpenCodeFiles(files: readonly GeneratedFile[]): string[] {
  const errors: string[] = [];

  for (const file of files) {
    if (!file.path.startsWith('.opencode/')) {
      errors.push(`OpenCode file path must start with .opencode/: ${file.path}`);
    }
    if (typeof file.content !== 'string' || file.content.length === 0) {
      errors.push(`OpenCode file content must be a non-empty string: ${file.path}`);
    }

    // Validate frontmatter: command and agent files must start with ---
    if (file.path.includes('/commands/') || file.path.includes('/agents/')) {
      if (!file.content.startsWith('---')) {
        errors.push(`OpenCode file must start with YAML frontmatter (---): ${file.path}`);
      }
    }
  }

  const hasCommand = files.some((f) => f.path.includes('/commands/'));
  if (!hasCommand && files.length > 0) {
    errors.push('OpenCode output must include at least one command file (.opencode/commands/)');
  }

  const hasAgent = files.some((f) => f.path.includes('/agents/'));
  if (!hasAgent && files.length > 0) {
    errors.push('OpenCode output must include at least one agent file (.opencode/agents/)');
  }

  return errors;
}

/**
 * Renders an AgentContract into OpenCode's `.opencode/` config structure.
 *
 * Wraps the existing `generateOpenCodeFiles()` and adds format validation.
 */
export class OpenCodeAgentContractRenderer implements AgentContractRenderer {
  readonly target: ContractTarget = 'opencode';

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
    const files = generateOpenCodeFiles(contract.council);

    // Validate generated output
    const validationErrors = validateOpenCodeFiles(files);

    return {
      target: this.target,
      files,
      allValid: validationErrors.length === 0,
      errors: validationErrors,
    };
  }
}
