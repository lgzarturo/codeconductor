import type { ConsensusConfig } from './council-consensus';

const SECURITY_HINTS = ['security', 'auth', 'injection', 'credentials', 'supply-chain'];

/**
 * Council specification interface
 */
export interface CouncilSpec {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly outputContract: string;
  readonly agents: readonly CouncilAgentSpec[];
}

/**
 * Council agent specification
 */
export interface CouncilAgentSpec {
  readonly id: string;
  readonly role: string;
  readonly context: 'repo-readonly' | 'prompt-only';
  readonly modelHint:
    | 'strong-reasoning'
    | 'security-reasoning'
    | 'balanced'
    | 'practical-coding'
    | 'analytical'
    | 'adversarial';
  readonly focus: readonly string[];
}

export interface CouncilPanelRequest {
  readonly type: string;
  readonly risk: 'low' | 'medium' | 'high';
  readonly scope: readonly string[];
}

/**
 * Default council agents
 */
export const DEFAULT_COUNCIL_AGENTS: CouncilAgentSpec[] = [
  {
    id: 'architect',
    role: 'Architect',
    context: 'repo-readonly',
    modelHint: 'strong-reasoning',
    focus: ['architecture', 'design-patterns', 'code-structure'],
  },
  {
    id: 'product',
    role: 'Product',
    context: 'prompt-only',
    modelHint: 'balanced',
    focus: ['requirements', 'ux', 'business-value'],
  },
  {
    id: 'delivery',
    role: 'Delivery',
    context: 'repo-readonly',
    modelHint: 'practical-coding',
    focus: ['delivery', 'testing', 'deployment'],
  },
  {
    id: 'data-ops',
    role: 'DataOps',
    context: 'repo-readonly',
    modelHint: 'analytical',
    focus: ['data', 'pipelines', 'analytics'],
  },
  {
    id: 'security-reviewer',
    role: 'Security Reviewer',
    context: 'repo-readonly',
    modelHint: 'security-reasoning',
    focus: [
      'security',
      'vulnerabilities',
      'compliance',
      'credentials',
      'injection',
      'auth',
      'supply-chain',
    ],
  },
  {
    id: 'devil',
    role: 'Devil',
    context: 'repo-readonly',
    modelHint: 'adversarial',
    focus: ['review', 'edge-cases', 'failure-modes'],
  },
];

export function hasSecurityFocusedAgent(spec: CouncilSpec): boolean {
  return spec.agents.some((agent) => {
    const haystack = [agent.id, agent.role, ...agent.focus].join(' ').toLowerCase();
    return SECURITY_HINTS.some((hint) => haystack.includes(hint));
  });
}

/**
 * Derive a ConsensusConfig from the effective council spec.
 * `allowSecurityVeto` requires at least one security-focused agent.
 */
export function deriveConsensusConfig(
  spec: CouncilSpec,
  overrides: Partial<ConsensusConfig> = {},
): ConsensusConfig {
  const expectedAgentIds = overrides.expectedAgentIds ?? spec.agents.map((agent) => agent.id);
  const allowSecurityVeto = overrides.allowSecurityVeto ?? true;
  if (allowSecurityVeto && !hasSecurityFocusedAgent(spec)) {
    throw new Error(
      'allowSecurityVeto requires at least one security-focused agent in the council roster',
    );
  }
  return {
    algorithm: overrides.algorithm ?? 'majority',
    allowSecurityVeto,
    allowComplianceVeto: overrides.allowComplianceVeto ?? true,
    expectedAgentIds,
    quorum: overrides.quorum ?? Math.ceil(expectedAgentIds.length / 2),
    criticalFindingsPolicy: overrides.criticalFindingsPolicy ?? 'escalate',
    candidateHash: overrides.candidateHash,
  };
}

const DATA_HINTS = ['data', 'database', 'migration', 'analytics', 'pipeline', 'sql'];

/**
 * Select the smallest deterministic panel that covers the declared work.
 * The input is deliberately descriptive rather than inferred from the tree so
 * planning is repeatable and review scope remains auditable.
 */
export function selectCouncilPanel(
  spec: CouncilSpec,
  request: CouncilPanelRequest,
): ConsensusConfig {
  const type = request.type.trim().toLowerCase();
  const scope = request.scope.join(' ').toLowerCase();
  const selected = new Set(['delivery', 'security-reviewer', 'devil']);
  const isFeature = type === 'feature' || type === 'api';
  const isStructural = ['feature', 'api', 'refactor', 'migration', 'database'].includes(type);

  if (isFeature || request.risk !== 'low') selected.add('architect');
  if (isFeature || request.risk === 'high') selected.add('product');
  if (DATA_HINTS.some((hint) => scope.includes(hint)) || ['migration', 'database'].includes(type)) {
    selected.add('data-ops');
  }
  if (request.risk === 'high' || SECURITY_HINTS.some((hint) => scope.includes(hint))) {
    selected.add('security-reviewer');
  }
  if (isStructural) selected.add('architect');

  const expectedAgentIds = spec.agents
    .map((agent) => agent.id)
    .filter((id) => selected.has(id));
  return deriveConsensusConfig(spec, {
    expectedAgentIds,
    quorum: Math.ceil(expectedAgentIds.length / 2),
  });
}

/**
 * Convert a CouncilSpec to an AgentContract targeting specific providers.
 * Convenience helper — no changes to existing CouncilSpec types.
 */
export function toAgentContract(
  spec: CouncilSpec,
  targets: readonly ('claude' | 'opencode' | 'codex' | 'gemini' | 'cursor' | 'agy')[],
  contractVersion = '1.0.0',
): import('./agent-contract').AgentContract {
  return {
    council: spec,
    targets: targets.map((target) => ({ target })),
    contractVersion,
  };
}

/**
 * SEO Hotel council agents
 */
export const SEO_HOTEL_COUNCIL_AGENTS: CouncilAgentSpec[] = [
  {
    id: 'seo-auditor',
    role: 'SEO Auditor',
    context: 'repo-readonly',
    modelHint: 'analytical',
    focus: ['technical-seo', 'meta-tags', 'crawlability', 'page-speed'],
  },
  {
    id: 'schema-validator',
    role: 'Schema Validator',
    context: 'repo-readonly',
    modelHint: 'strong-reasoning',
    focus: ['schema-org', 'json-ld', 'structured-data', 'rich-results'],
  },
  {
    id: 'geo-specialist',
    role: 'GEO Specialist',
    context: 'repo-readonly',
    modelHint: 'balanced',
    focus: ['ai-search', 'citable-content', 'llms-txt', 'generative-engine-optimization'],
  },
  {
    id: 'content-strategist',
    role: 'Content Strategist',
    context: 'prompt-only',
    modelHint: 'balanced',
    focus: ['content-marketing', 'off-page-seo', 'backlinks', 'hotel-copywriting'],
  },
  {
    id: 'astro-specialist',
    role: 'Astro Specialist',
    context: 'repo-readonly',
    modelHint: 'practical-coding',
    focus: ['astro-framework', 'static-generation', 'islands-architecture', 'performance'],
  },
];
