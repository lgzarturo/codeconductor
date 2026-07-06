import type {
  AgentContract,
  ContractTarget,
} from '../../domain/council/agent-contract';
import type {
  AgentContractRenderResult,
  AgentContractRenderer,
} from '../../core/generation/agent-contract-renderer';
import type { GeneratedFile } from '../../core/generation/generated-file';
import { generateCodexFiles } from './codex-council-generator';
import { CouncilSpecSchema } from '../../validation/schemas';

/**
 * Validates that generated Codex files follow expected patterns:
 * - Paths must start with .codex/
 * - At least one skill file must exist
 * - Agent files must follow .codex/agents/council_*.toml pattern
 */
function validateCodexFiles(files: readonly GeneratedFile[]): string[] {
  const errors: string[] = [];

  for (const file of files) {
    if (!file.path.startsWith('.codex/')) {
      errors.push(`Codex file path must start with .codex/: ${file.path}`);
    }
    if (typeof file.content !== 'string' || file.content.length === 0) {
      errors.push(`Codex file content must be a non-empty string: ${file.path}`);
    }
  }

  const hasSkill = files.some((f) => f.path.includes('/skills/'));
  if (!hasSkill && files.length > 0) {
    errors.push('Codex output must include at least one skill file (.codex/skills/)');
  }

  const hasAgent = files.some((f) => f.path.includes('/agents/'));
  if (!hasAgent && files.length > 0) {
    errors.push('Codex output must include at least one agent file (.codex/agents/)');
  }

  return errors;
}

/**
 * Renders an AgentContract into Codex CLI's `.codex/` config structure.
 *
 * Wraps the existing `generateCodexFiles()` and adds format validation.
 */
export class CodexAgentContractRenderer implements AgentContractRenderer {
  readonly target: ContractTarget = 'codex';

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
    const files = generateCodexFiles(contract.council);

    // Validate generated output
    const validationErrors = validateCodexFiles(files);

    return {
      target: this.target,
      files,
      allValid: validationErrors.length === 0,
      errors: validationErrors,
    };
  }
}
