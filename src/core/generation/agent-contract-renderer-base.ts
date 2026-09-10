import type { AgentContract, ContractTarget } from '../../domain/council/agent-contract';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { CouncilSpecSchema } from '../../validation/schemas';
import type { AgentContractRenderResult } from './agent-contract-renderer';
import type { GeneratedFile } from './generated-file';

export interface AgentContractRendererConfig {
  readonly target: ContractTarget;
  /** e.g. '.claude/' — every generated file path must start with this. */
  readonly pathPrefix: string;
  /** Delegates to the target's existing council file generator. */
  readonly generate: (council: CouncilSpec) => GeneratedFile[];
  /** e.g. ['/skills/', '/agents/'] — at least one file per dir must exist. */
  readonly requiredDirs: readonly string[];
  /**
   * Dirs whose files must start with a YAML frontmatter fence (`---`).
   * Only OpenCode enforces this today.
   */
  readonly requireFrontmatterFence?: readonly string[];
}

/**
 * Shared render + validate logic for every *AgentContractRenderer adapter
 * class. The 4 adapters (claude, opencode, codex, agy) were ~90 lines each
 * of near-identical boilerplate differing only in path prefix, which
 * generator to delegate to, and which dirs are required — this is that
 * shared body, parameterized per target.
 */
export function renderAgentContract(
  contract: AgentContract,
  config: AgentContractRendererConfig
): AgentContractRenderResult {
  const { target, pathPrefix, generate, requiredDirs, requireFrontmatterFence } = config;

  const councilValidation = CouncilSpecSchema.safeParse(contract.council);
  if (!councilValidation.success) {
    return {
      target,
      files: [],
      allValid: false,
      errors: [
        `Invalid CouncilSpec: ${councilValidation.error.issues.map((i) => i.message).join(', ')}`,
      ],
    };
  }

  const hasTarget = contract.targets.some((t) => t.target === target);
  if (!hasTarget) {
    return {
      target,
      files: [],
      allValid: false,
      errors: [`Contract does not include target: ${target}`],
    };
  }

  const files = generate(contract.council);
  const errors = validateFiles(files, pathPrefix, requiredDirs, requireFrontmatterFence);

  return { target, files, allValid: errors.length === 0, errors };
}

function validateFiles(
  files: readonly GeneratedFile[],
  pathPrefix: string,
  requiredDirs: readonly string[],
  requireFrontmatterFence: readonly string[] | undefined
): string[] {
  const errors: string[] = [];

  for (const file of files) {
    if (!file.path.startsWith(pathPrefix)) {
      errors.push(`File path must start with ${pathPrefix}: ${file.path}`);
    }
    if (typeof file.content !== 'string' || file.content.length === 0) {
      errors.push(`File content must be a non-empty string: ${file.path}`);
    }
    if (requireFrontmatterFence?.some((dir) => file.path.includes(dir)) && !file.content.startsWith('---')) {
      errors.push(`File must start with YAML frontmatter (---): ${file.path}`);
    }
  }

  if (files.length > 0) {
    for (const dir of requiredDirs) {
      if (!files.some((f) => f.path.includes(dir))) {
        errors.push(`Output must include at least one file under ${dir}`);
      }
    }
  }

  return errors;
}
