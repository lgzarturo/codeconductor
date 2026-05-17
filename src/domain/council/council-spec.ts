/**
 * Council specification interface
 */
export interface CouncilSpec {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly outputContract: string
  readonly agents: readonly CouncilAgentSpec[]
}

/**
 * Council agent specification
 */
export interface CouncilAgentSpec {
  readonly id: string
  readonly role: string
  readonly context: 'repo-readonly' | 'prompt-only'
  readonly modelHint: 'strong-reasoning' | 'security-reasoning' | 'balanced' | 'practical-coding' | 'analytical' | 'adversarial'
  readonly focus: readonly string[]
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
    focus: ['architecture', 'design-patterns', 'code-structure']
  },
  {
    id: 'security',
    role: 'Security',
    context: 'repo-readonly',
    modelHint: 'security-reasoning',
    focus: ['security', 'vulnerabilities', 'compliance']
  },
  {
    id: 'product',
    role: 'Product',
    context: 'prompt-only',
    modelHint: 'balanced',
    focus: ['requirements', 'ux', 'business-value']
  },
  {
    id: 'delivery',
    role: 'Delivery',
    context: 'repo-readonly',
    modelHint: 'practical-coding',
    focus: ['delivery', 'testing', 'deployment']
  },
  {
    id: 'data-ops',
    role: 'DataOps',
    context: 'repo-readonly',
    modelHint: 'analytical',
    focus: ['data', 'pipelines', 'analytics']
  },
  {
    id: 'devil',
    role: 'Devil',
    context: 'repo-readonly',
    modelHint: 'adversarial',
    focus: ['review', 'edge-cases', 'failure-modes']
  }
]