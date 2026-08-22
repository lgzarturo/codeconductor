import { z } from 'zod';

/**
 * Council agent spec schema
 */
export const CouncilAgentSpecSchema = z.object({
  id: z.string(),
  role: z.string(),
  context: z.enum(['repo-readonly', 'prompt-only']),
  modelHint: z.enum([
    'strong-reasoning',
    'security-reasoning',
    'balanced',
    'practical-coding',
    'analytical',
    'adversarial',
  ]),
  focus: z.array(z.string()),
});

/**
 * Council spec schema
 */
export const CouncilSpecSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  outputContract: z.string(),
  agents: z.array(CouncilAgentSpecSchema),
});

/**
 * Project profile schema
 */
export const ProjectProfileSchema = z.object({
  rootDir: z.string(),
  languages: z.array(z.string()),
  runtimes: z.array(z.string()),
  packageManagers: z.array(z.string()),
  frameworks: z.array(z.string()),
  signals: z.array(z.string()),
  confidence: z.enum(['low', 'medium', 'high']),
});

/**
 * Compile check config schema — validates the compileCheck section
 */
export const CompileCheckConfigSchema = z.object({
  enabled: z.boolean(),
  command: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
});

/**
 * Loop config schema — validates the loop section for compile-fix iteration
 */
export const LoopConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  maxIterations: z.number().int().positive().optional().default(3),
  maxTokenBudget: z.number().nonnegative().optional().default(0),
  compaction: z.object({
    enabled: z.boolean().optional().default(true),
    historyFile: z.string().optional(),
  }).optional(),
});

/**
 * CodeConductor config schema
 */
export const CodeConductorConfigSchema = z.object({
  version: z.string(),
  project: z.object({
    name: z.string(),
    profile: z.string().optional(),
  }),
  defaults: z.object({
    target: z.enum(['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy']),
    overwrite: z.boolean(),
    locale: z.enum(['en', 'es']).optional().default('en'),
  }),
  presets: z.object({
    council: z.object({
      enabled: z.boolean(),
      version: z.string(),
    }),
  }),
  safety: z.object({
    destructiveCommands: z.array(z.string()),
    secretPatterns: z.array(z.string()),
    compileCheck: CompileCheckConfigSchema.optional(),
  }),
  loop: LoopConfigSchema.optional(),
});

/**
 * Runner target schema
 */
export const RunnerTargetSchema = z.enum([
  'opencode',
  'claude',
  'codex',
  'gemini',
  'cursor',
  'agy',
  'all',
]);

/**
 * Install manifest schemas
 */
export const InstallStrategySchema = z.enum([
  'overwrite',
  'append',
  'merge-json',
  'merge-managed',
  'skip',
]);

export const ManifestEntrySchema = z.object({
  src: z.string(),
  dest: z.string(),
  strategy: InstallStrategySchema,
  globalStrategy: InstallStrategySchema.optional(),
  template: z.boolean().optional(),
});

export const InstallManifestSchema = z.object({
  target: z.enum(['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy']),
  entries: z.array(ManifestEntrySchema),
});

/**
 * Tool provider names schema — maps base tool names to provider-specific names
 */
export const ToolProviderNamesSchema = z.record(z.string(), z.string());
export const PermissionProviderNamesSchema = z.record(z.string(), z.string());

/**
 * Model config schema — defines model names per provider per agent role
 */
export const ModelConfigSchema = z.object({
  target: z.enum(['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy']),
  agents: z.record(
    z.string(),
    z.object({
      claude: z.string().optional(),
      opencode: z.string().optional(),
      codex: z.string().optional(),
      gemini: z.string().optional(),
      cursor: z.string().optional(),
      agy: z.string().optional(),
      grok: z.string().optional(),
    })
  ),
  tools: z.record(z.string(), ToolProviderNamesSchema).optional(),
  permissions: PermissionProviderNamesSchema.optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * Type exports
 */
export type InstallStrategy = z.infer<typeof InstallStrategySchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type InstallManifest = z.infer<typeof InstallManifestSchema>;
export type CouncilAgentSpecInput = z.infer<typeof CouncilAgentSpecSchema>;
export type CouncilSpecInput = z.infer<typeof CouncilSpecSchema>;
export type ProjectProfileInput = z.infer<typeof ProjectProfileSchema>;
export type CodeConductorConfigInput = z.infer<typeof CodeConductorConfigSchema>;
export type CompileCheckConfigInput = z.infer<typeof CompileCheckConfigSchema>;
export type LoopConfigInput = z.infer<typeof LoopConfigSchema>;
export type RunnerTargetInput = z.infer<typeof RunnerTargetSchema>;

/**
 * Validate council spec
 */
export function validateCouncilSpec(data: unknown): CouncilSpecInput {
  return CouncilSpecSchema.parse(data);
}

/**
 * Validate project profile
 */
export function validateProjectProfile(data: unknown): ProjectProfileInput {
  return ProjectProfileSchema.parse(data);
}

/**
 * Validate config
 */
export function validateConfig(data: unknown): CodeConductorConfigInput {
  return CodeConductorConfigSchema.parse(data);
}

/**
 * Validate runner target
 */
export function validateRunnerTarget(data: unknown): RunnerTargetInput {
  return RunnerTargetSchema.parse(data);
}

/**
 * Validate model configuration
 */
export function validateModelConfig(data: unknown): ModelConfig {
  return ModelConfigSchema.parse(data);
}

// ─── Agent Contract Schemas ────────────────────────────────────────────────────

/**
 * Contract target enum
 */
export const ContractTargetSchema = z.enum([
  'claude',
  'opencode',
  'codex',
  'gemini',
  'cursor',
  'agy',
]);

/**
 * Contract format schema — a target with optional render options
 */
export const ContractFormatSchema = z.object({
  target: ContractTargetSchema,
  options: z.record(z.unknown()).optional(),
});

/**
 * Agent contract schema — provider-agnostic contract definition
 */
export const AgentContractSchema = z.object({
  council: CouncilSpecSchema,
  targets: z.array(ContractFormatSchema),
  contractVersion: z.string(),
  renderHints: z
    .record(ContractTargetSchema, z.record(z.unknown()))
    .optional(),
});

// ─── Council Consensus Schemas ─────────────────────────────────────────────────

/**
 * Council finding schema — a single review observation
 */
export const CouncilFindingSchema = z.object({
  category: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  agentId: z.string(),
});

/**
 * Council verdict input schema — verdict from a single reviewer
 */
export const CouncilVerdictInputSchema = z.object({
  agentId: z.string().min(1).refine((id) => id.trim().length > 0),
  agentRole: z.string(),
  status: z.enum(['APPROVED', 'REJECTED', 'ABSTAIN']),
  securityVeto: z.boolean(),
  complianceVeto: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  findings: z.array(CouncilFindingSchema),
  summary: z.string(),
});

/**
 * Consensus config schema
 */
export const ConsensusConfigSchema = z
  .object({
    algorithm: z.enum(['majority', 'unanimous']),
    allowSecurityVeto: z.boolean(),
    allowComplianceVeto: z.boolean().optional(),
    expectedAgentIds: z
      .array(z.string().min(1).refine((id) => id.trim().length > 0))
      .min(1)
      .refine(
        (ids) =>
          new Set(ids.map((id) => id.trim().toLowerCase())).size === ids.length,
      )
      .optional(),
  })
  // The unanimous algorithm cannot approve without a roster, so a config that
  // omits one is rejected at the edge rather than escalating every review.
  .refine((config) => config.algorithm !== 'unanimous' || config.expectedAgentIds !== undefined, {
    message: 'unanimous consensus requires a non-empty expectedAgentIds roster',
    path: ['expectedAgentIds'],
  });

/**
 * Council verdict schema — the final output of the consensus engine
 */
export const CouncilVerdictSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'ESCALATED']),
  totalAgents: z.number(),
  approvedCount: z.number(),
  rejectedCount: z.number(),
  abstainedCount: z.number(),
  vetoApplied: z.boolean(),
  complianceVetoApplied: z.boolean().optional(),
  vetoByAgentId: z.string().optional(),
  averageConfidence: z.number().min(0).max(1).optional(),
  findings: z.array(CouncilFindingSchema),
  summary: z.string(),
  individualVerdicts: z.array(CouncilVerdictInputSchema),
});

// ─── Provider Rendered File Schemas ────────────────────────────────────────────

/**
 * Claude agent file schema — validates a single Claude-generated agent markdown file
 */
export const ClaudeAgentFileSchema = z.object({
  path: z.string().startsWith('.claude/'),
  content: z.string(),
  overwrite: z.boolean(),
});

/**
 * OpenCode agent file schema — validates a single OpenCode-generated agent markdown file
 */
export const OpenCodeAgentFileSchema = z.object({
  path: z.string().startsWith('.opencode/'),
  content: z.string(),
  overwrite: z.boolean(),
});

// ─── Sentry Webhook Schema ──────────────────────────────────────────────────

/**
 * Stack frame schema — a single frame from a Sentry stack trace
 */
export const SentryStackFrameSchema = z.object({
  filename: z.string(),
  function: z.string(),
  lineNo: z.number(),
  colNo: z.number().optional(),
  context: z.array(z.string()),
});

/**
 * Sentry webhook payload schema — validates the issue context from Sentry webhooks
 */
export const SentryWebhookSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  culprit: z.string(),
  filename: z.string().optional(),
  stackTrace: z.array(SentryStackFrameSchema),
  environment: z.string().optional(),
  release: z.string().optional(),
});

export type SentryWebhookInput = z.infer<typeof SentryWebhookSchema>;

// ─── Memory Index Schemas ─────────────────────────────────────────────────────

/**
 * Memory pointer schema — a lightweight reference to an Engram observation
 */
export const MemoryPointerSchema = z.object({
  topic_key: z.string().min(1).max(128),
  id: z.number().int().positive(),
  file: z.string().min(1),
  summary: z.string().min(1).max(200),
  timestamp: z.string().datetime(),
  tags: z.array(z.string().max(64)).max(10).optional().default([]),
});

/**
 * Memory index schema — the persistent pointer layer of the 3-layer memory arch
 */
export const MemoryIndexSchema = z.object({
  version: z.literal(1),
  pointers: z.array(MemoryPointerSchema),
});

// ─── Goal Graph Schemas ───────────────────────────────────────────────────────

/**
 * Goal task schema — a single task in a goal graph
 */
export const GoalTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['feature', 'fix', 'refactor', 'test', 'docs']),
  risk: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'in-progress', 'done', 'blocked']),
  depends_on: z.array(z.string()).optional().default([]),
  acceptance_criteria: z.array(z.string()),
  blocked_reason: z.string().optional(),
  context_scope: z.enum(['isolated', 'continuation', 'full']).optional().default('isolated'),
});

/**
 * Goal graph schema — a complete goal with task dependencies
 */
export const GoalGraphSchema = z.object({
  objective: z.string(),
  tasks: z.array(GoalTaskSchema),
  created_at: z.string(),
});

// ─── Product OS Schemas ─────────────────────────────────────────────────────────

export const ConfidenceLevelSchema = z.enum(['low', 'medium', 'high']);

export const ProductNodeTypeSchema = z.enum([
  'product',
  'domain',
  'capability',
  'requirement',
  'decision',
  'component',
  'flow',
  'contract',
  'metric',
  'risk',
  'task',
  'evidence',
]);

export const GraphRelationSchema = z.enum([
  'implements',
  'depends_on',
  'documents',
  'affects',
  'evidences',
  'blocks',
  'contains',
]);

export const KnowledgeEntitySchema = z.object({
  type: ProductNodeTypeSchema,
  id: z.string(),
  name: z.string(),
  source: z.string(),
  version: z.string().optional(),
  confidence: ConfidenceLevelSchema,
  relations: z
    .array(
      z.object({
        targetId: z.string(),
        relation: GraphRelationSchema,
      }),
    )
    .default([]),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const DecisionSchema = z.object({
  id: z.string(),
  context: z.string(),
  alternatives: z.array(z.string()).default([]),
  chosenOption: z.string(),
  rationale: z.string(),
  consequences: z.array(z.string()).default([]),
  date: z.string(),
  linkedTasks: z.array(z.string()).default([]),
  linkedComponents: z.array(z.string()).default([]),
  source: z.string().optional(),
});

export const EvidenceSchema = z.object({
  id: z.string(),
  source: z.string(),
  type: z.string(),
  timestamp: z.string(),
  relatedTask: z.string().optional(),
  relatedDecision: z.string().optional(),
  confidence: z.number().min(0).max(1),
  checksum: z.string().optional(),
  summary: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const CanonicalTaskCardStatusSchema = z.enum([
  'draft',
  'ready',
  'in-progress',
  'review',
  'done',
  'blocked',
]);

export const CanonicalTaskCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string(),
  context: z.string(),
  acceptanceCriteria: z.array(z.string()),
  dependencies: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  risk: z.enum(['low', 'medium', 'high']),
  targetFiles: z.array(z.string()).default([]),
  agentType: z.string(),
  evidenceRequired: z.array(z.string()).default([]),
  status: CanonicalTaskCardStatusSchema,
  type: z.enum(['feature', 'fix', 'refactor', 'review', 'docs', 'test']).optional(),
  linkedCapabilities: z.array(z.string()).default([]),
});

export const ProductGraphNodeSchema = z.object({
  id: z.string(),
  type: ProductNodeTypeSchema,
  name: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  source: z.string().optional(),
  confidence: ConfidenceLevelSchema.optional(),
  version: z.string().optional(),
});

export const ProductGraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: GraphRelationSchema,
});

export const ProductGraphSchema = z.object({
  version: z.literal(1),
  productId: z.string(),
  productName: z.string(),
  nodes: z.array(ProductGraphNodeSchema),
  edges: z.array(ProductGraphEdgeSchema),
  updatedAt: z.string(),
});

export const ProductMetaSchema = z.object({
  version: z.literal(1),
  graphVersion: z.string(),
  lastIngestAt: z.string().optional(),
  sourceHashes: z.record(z.string(), z.string()).default({}),
});

export const ProductEventTypeSchema = z.enum([
  'task.started',
  'task.completed',
  'decision.recorded',
  'evidence.added',
  'ingest.completed',
  'goal.updated',
  'blocker.detected',
  'verification.completed',
  'feedback.processed',
]);

export const ProductEventSchema = z.object({
  id: z.string(),
  type: ProductEventTypeSchema,
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const OperationalStateSchema = z.object({
  version: z.literal(1),
  activeAgents: z.array(z.string()).default([]),
  activeTaskIds: z.array(z.string()).default([]),
  blockers: z
    .array(
      z.object({
        taskId: z.string(),
        reason: z.string(),
        since: z.string(),
      }),
    )
    .default([]),
  sprintFocus: z.string().optional(),
  updatedAt: z.string(),
});

export const StrategicMemorySchema = z.object({
  version: z.literal(1),
  kpis: z
    .array(
      z.object({
        name: z.string(),
        target: z.string(),
        current: z.string().optional(),
      }),
    )
    .default([]),
  quarterlyFocus: z.string().optional(),
  tradeoffs: z.array(z.string()).default([]),
  updatedAt: z.string(),
});

export const ImpactReportSchema = z.object({
  target: z.string(),
  brokenEndpoints: z.array(z.string()).default([]),
  brokenContracts: z.array(z.string()).default([]),
  affectedTests: z.array(z.string()).default([]),
  affectedFlows: z.array(z.string()).default([]),
  affectedComponents: z.array(z.string()).default([]),
  summary: z.string(),
});

export const BusinessReviewOutputSchema = z.object({
  status: z.enum(['proceed', 'defer', 'reject']),
  roiEstimate: z.string().optional(),
  userImpact: z.string().optional(),
  eliminationRisk: z.string().optional(),
  questions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export const VerificationReportSchema = z.object({
  taskId: z.string(),
  passed: z.boolean(),
  checks: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      message: z.string(),
    }),
  ),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

// ─── OpenSpec / Backlog Schemas ───────────────────────────────────────────────

export const BacklogStatusSchema = z.enum([
  'TODO',
  'READY',
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'REVIEW',
  'DONE',
]);

export const BacklogTypeSchema = z.enum(['feature', 'bug', 'refactor', 'tech-debt']);

export const BacklogPrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);

export const BacklogGlobalSchema = z.object({
  product: z.string().min(1),
  strategy: z.string().min(1),
  policy: z.string().min(1),
  reviewRequired: z.boolean(),
  tddRequired: z.boolean(),
});

export const BacklogItemSchema = z.object({
  id: z.string().regex(/^BC-\d{3,}$/),
  title: z.string().min(1),
  priority: BacklogPrioritySchema,
  status: BacklogStatusSchema,
  type: BacklogTypeSchema,
  owner: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  description: z.string().min(1),
  scope: z.string().min(1),
  outOfScope: z.string().default(''),
  businessValue: z.string().optional(),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  risks: z.string().optional(),
  progress: z.number().int().min(0).max(100),
  branch: z.string().optional(),
  reviewer: z.string().optional(),
  lastUpdate: z.string().optional(),
});

export const BacklogDocumentSchema = z.object({
  global: BacklogGlobalSchema,
  items: z.array(BacklogItemSchema),
  archive: z.array(BacklogItemSchema).default([]),
});

export const OpenspecTaskCardPhaseSchema = z.enum([
  'discover',
  'design',
  'implement',
  'test',
  'review',
]);

export const OpenspecTaskCardStatusSchema = z.enum(['pending', 'doing', 'blocked', 'done']);

export const OpenspecTaskCardSchema = z.object({
  id: z.string(),
  backlogId: z.string(),
  phase: OpenspecTaskCardPhaseSchema,
  title: z.string(),
  prompt: z.string(),
  agent: z.string(),
  modelHint: z.string().optional(),
  dependsOn: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()),
  status: OpenspecTaskCardStatusSchema,
});

export const OpenspecStateSchema = z.object({
  version: z.literal(1),
  activeItemId: z.string().optional(),
  taskCards: z.array(OpenspecTaskCardSchema).default([]),
  lastScanHash: z.string().optional(),
  lastScanAt: z.string().optional(),
  changePaths: z.record(z.string(), z.string()).optional().default({}),
  itemSnapshots: z.record(z.string(), z.string()).optional().default({}),
});

// ─── CCEP-1 (CodeConductor Execution Protocol) Schemas ───────────────────────

export const WorkflowCommandSchema = z.enum([
  'feature',
  'fix',
  'refactor',
  'review',
  'test-plan',
  'tdd-cycle',
  'api-contract',
  'db-migration',
  'pagespeed',
  'openspec',
  'scorecard',
  'council',
  'iterative',
  'explore',
  'triage',
  'prototype',
  'handoff',
  'clarify',
]);

export const CcepOutputFormatSchema = z.enum(['taskcard', 'plan', 'verdict']);

export const CommandEnvelopeSchema = z.object({
  protocolVersion: z.literal('ccep-1'),
  command: WorkflowCommandSchema,
  userRequest: z.string(),
  projectId: z.string(),
  repoContext: z.object({
    domain: z.string().optional(),
    stack: z.array(z.string()),
    existingModules: z.array(z.string()).default([]),
    architecture: z.string().optional(),
  }),
  constraints: z.object({
    outputFormat: CcepOutputFormatSchema,
    needConfirmation: z.boolean(),
    riskThreshold: z.enum(['low', 'medium', 'high']),
  }),
  executionPolicy: z.object({
    modelMode: z.literal('structured'),
    maxVariance: z.literal('low'),
  }),
});

export const WorkflowPhaseSchema = z.object({
  id: z.string(),
  agent: z.string().optional(),
  agents: z.array(z.string()).optional(),
  skill: z.string().optional(),
  type: z.string().optional(),
  outputSchema: z.string().optional(),
  stopGate: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  requires: z.string().optional(),
  parallelWith: z.array(z.string()).optional(),
});

export const WorkflowRiskRuleSchema = z.object({
  when: z.object({
    risk: z.union([
      z.enum(['low', 'medium', 'high']),
      z.array(z.enum(['low', 'medium', 'high'])),
    ]),
  }),
  then: z.array(z.string()),
});

export const WorkflowProfileSchema = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
    command: WorkflowCommandSchema,
    taskCard: z
      .object({
        type: z.string(),
        requiredFields: z.array(z.string()),
        optionalFields: z.array(z.string()).optional(),
      })
      .optional(),
    intakeSchema: z.string().optional(),
    phases: z.array(WorkflowPhaseSchema),
    routing: z.object({
      default: z.array(z.string()),
      riskRules: z.array(WorkflowRiskRuleSchema).optional(),
    }),
    confirmationGate: z.object({
      stopOnHighRisk: z.boolean(),
      stopOnQuestions: z.boolean(),
    }),
  })
  .refine((profile) => profile.id === profile.command, {
    message: 'Workflow profile id must match command',
  });

export const ExecutionContextSchema = z.object({
  envelope: CommandEnvelopeSchema,
  profile: WorkflowProfileSchema,
  intent: z.object({
    type: WorkflowCommandSchema,
    goal: z.string(),
    domain: z.string().optional(),
    entity: z.string().optional(),
    operation: z.string().optional(),
  }),
  project: z.object({
    name: z.string(),
    rootDir: z.string(),
    stack: z.array(z.string()).optional(),
  }),
  knowledge: z.record(z.string(), z.unknown()).default({}),
  ast: z.object({
    source: z.enum(['detect', 'graphify', 'manual', 'product-graph']),
    confidence: z.enum(['low', 'medium', 'high']),
    domains: z.array(z.unknown()).optional(),
    rules: z.array(z.string()).optional(),
  }),
  policies: z.object({
    architecture: z.string(),
    testing: z.string(),
    documentation: z.string(),
    breakingChanges: z.string(),
  }),
  currentPhase: z.string().optional(),
  outputSchema: z.string(),
});

export const PlannerOutputSchema = z.object({
  status: z.enum(['success', 'needs_clarification']),
  confidence: z.number().min(0).max(1),
  goal: z.string(),
  assumptions: z.array(z.string()),
  risks: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
    }),
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      priority: z.string(),
      estimate: z.string(),
      dependencies: z.array(z.string()),
    }),
  ),
  questionsForUser: z.array(z.string()),
  needsConfirmation: z.boolean(),
});

export const AgentArtifactSchema = z.object({
  type: z.string(),
  path: z.string().optional(),
  content: z.string().optional(),
});

export const AgentOutputSchema = z.object({
  status: z.enum(['success', 'failure', 'blocked', 'needs_clarification']),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
  artifacts: z.array(AgentArtifactSchema).default([]),
  next_actions: z.array(z.string()).default([]),
});

export const ImplementerTestsSchema = z.object({
  runner: z.string(),
  result: z.enum(['passed', 'failed']),
  failedTests: z.array(z.string()).optional(),
});

export const ImplementerOutputSchema = AgentOutputSchema.extend({
  status: z.enum(['success', 'failure', 'blocked']),
  filesChanged: z
    .array(
      z.object({
        path: z.string(),
        summary: z.string(),
      }),
    )
    .default([]),
  tests: ImplementerTestsSchema.optional(),
});

export const ReviewAxisSchema = z.enum([
  'complexity',
  'cost',
  'performance',
  'maintainability',
  'security',
  'scalability',
  'style',
]);

export const ReviewFindingSchema = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  message: z.string(),
  axis: z.union([ReviewAxisSchema, z.string()]),
  path: z.string().optional(),
  line: z.number().int().optional(),
});

export const ReviewerOutputSchema = z.object({
  status: z.enum(['pass', 'fail']),
  confidence: z.number().min(0).max(1),
  verdict: z.enum(['approved', 'approved_with_warnings', 'blocked']),
  warnings: z.array(z.string()).default([]),
  findings: z.array(ReviewFindingSchema).default([]),
  artifacts: z.array(AgentArtifactSchema).default([]),
  next_actions: z.array(z.string()).default([]),
});

export const TechnicalPlanOutputSchema = z.object({
  approach: z.string(),
  filesAffected: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).optional(),
});

// ─── Evaluation / Scorecard Schemas ───────────────────────────────────────────

export const ScorecardVerdictSchema = z.enum(['PASS', 'REVISE', 'REJECT']);

export const ScorecardCriterionIdSchema = z.enum([
  'acceptance',
  'minimal_diff',
  'tests',
  'regressions',
  'conventions',
  'documentation',
  'context_discipline',
  'cc_gain',
]);

export const ScorecardCriterionSchema = z.object({
  id: ScorecardCriterionIdSchema,
  label: z.string(),
  weight: z.number().min(0).max(1),
  score: z.number().int().min(0).max(3),
  notes: z.string().optional(),
  autoSuggested: z.boolean().optional(),
});

export const ScorecardRecordSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  agent: z.string(),
  model: z.string().optional(),
  contractVersion: z.string(),
  evaluator: z.string().optional(),
  criteria: z.array(ScorecardCriterionSchema),
  weightedScore: z.number(),
  verdict: ScorecardVerdictSchema,
  findings: z.array(z.string()).optional().default([]),
  createdAt: z.string(),
  backlogId: z.string().optional(),
  source: z.enum(['openspec', 'review', 'manual', 'pipeline']).optional(),
});

export const TaskOutcomeSourceSchema = z.enum(['openspec', 'review', 'manual', 'pipeline']);

export const TaskOutcomeStatusSchema = z.enum([
  'phase_done',
  'phase_failed',
  'pass',
  'revise',
  'reject',
]);

export const TaskOutcomeSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  source: TaskOutcomeSourceSchema,
  agent: z.string(),
  model: z.string(),
  contractVersion: z.string(),
  timestamp: z.string(),
  status: TaskOutcomeStatusSchema.optional(),
  verdict: ScorecardVerdictSchema.optional(),
  weightedScore: z.number().optional(),
  taskCardId: z.string().optional(),
  backlogId: z.string().optional(),
  phase: z.string().optional(),
  scorecardId: z.string().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  costUsd: z.number().optional(),
  durationMs: z.number().optional(),
});

export const EvaluationIndexSchema = z.object({
  version: z.literal(1),
  lastOutcomeId: z.string().optional(),
});

export const ExecutionProfileNameSchema = z.enum(['balanced', 'quality', 'economical']);

export const ExecutionProfileSchema = z.object({
  profile: ExecutionProfileNameSchema.default('balanced'),
  target: z.enum(['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy']).optional(),
  overrides: z.record(z.string(), z.string()).optional().default({}),
  subagentPolicy: z
    .object({
      orchestrator: z.enum(['primary', 'delegate']).optional(),
      testerReviewer: z.enum(['primary', 'delegate']).optional(),
    })
    .optional(),
});

// ─── Schema Type Exports ──────────────────────────────────────────────────────

export type ContractTargetInput = z.infer<typeof ContractTargetSchema>;
export type ContractFormatInput = z.infer<typeof ContractFormatSchema>;
export type AgentContractInput = z.infer<typeof AgentContractSchema>;
export type CouncilFindingInput = z.infer<typeof CouncilFindingSchema>;
export type CouncilVerdictInputData = z.infer<typeof CouncilVerdictInputSchema>;
export type ConsensusConfigInput = z.infer<typeof ConsensusConfigSchema>;
export type CouncilVerdictOutput = z.infer<typeof CouncilVerdictSchema>;
export type GoalTaskInput = z.infer<typeof GoalTaskSchema>;
export type GoalGraphInput = z.infer<typeof GoalGraphSchema>;
export type KnowledgeEntityInput = z.infer<typeof KnowledgeEntitySchema>;
export type DecisionInput = z.infer<typeof DecisionSchema>;
export type EvidenceInput = z.infer<typeof EvidenceSchema>;
export type CanonicalTaskCardInput = z.infer<typeof CanonicalTaskCardSchema>;
export type ProductGraphInput = z.infer<typeof ProductGraphSchema>;
export type ProductGraphNodeInput = z.infer<typeof ProductGraphNodeSchema>;
export type ProductGraphEdgeInput = z.infer<typeof ProductGraphEdgeSchema>;
export type ProductMetaInput = z.infer<typeof ProductMetaSchema>;
export type ProductEventInput = z.infer<typeof ProductEventSchema>;
export type OperationalStateInput = z.infer<typeof OperationalStateSchema>;
export type StrategicMemoryInput = z.infer<typeof StrategicMemorySchema>;
export type ImpactReportInput = z.infer<typeof ImpactReportSchema>;
export type BusinessReviewOutputInput = z.infer<typeof BusinessReviewOutputSchema>;
export type VerificationReportInput = z.infer<typeof VerificationReportSchema>;
export type MemoryPointerInput = z.infer<typeof MemoryPointerSchema>;
export type MemoryIndexInput = z.infer<typeof MemoryIndexSchema>;
export type BacklogStatusInput = z.infer<typeof BacklogStatusSchema>;
export type BacklogTypeInput = z.infer<typeof BacklogTypeSchema>;
export type BacklogPriorityInput = z.infer<typeof BacklogPrioritySchema>;
export type BacklogGlobalInput = z.infer<typeof BacklogGlobalSchema>;
export type BacklogItemInput = z.infer<typeof BacklogItemSchema>;
export type BacklogDocumentInput = z.infer<typeof BacklogDocumentSchema>;
export type OpenspecTaskCardPhaseInput = z.infer<typeof OpenspecTaskCardPhaseSchema>;
export type OpenspecTaskCardStatusInput = z.infer<typeof OpenspecTaskCardStatusSchema>;
export type OpenspecTaskCardInput = z.infer<typeof OpenspecTaskCardSchema>;
export type OpenspecStateInput = z.infer<typeof OpenspecStateSchema>;
export type ScorecardVerdictInput = z.infer<typeof ScorecardVerdictSchema>;
export type ScorecardCriterionInput = z.infer<typeof ScorecardCriterionSchema>;
export type ScorecardRecordInput = z.infer<typeof ScorecardRecordSchema>;
export type TaskOutcomeInput = z.infer<typeof TaskOutcomeSchema>;
export type EvaluationIndexInput = z.infer<typeof EvaluationIndexSchema>;
export type ExecutionProfileInput = z.infer<typeof ExecutionProfileSchema>;
export type WorkflowCommandInput = z.infer<typeof WorkflowCommandSchema>;
export type CommandEnvelopeInput = z.infer<typeof CommandEnvelopeSchema>;
export type WorkflowProfileInput = z.infer<typeof WorkflowProfileSchema>;
export type ExecutionContextInput = z.infer<typeof ExecutionContextSchema>;
export type PlannerOutputInput = z.infer<typeof PlannerOutputSchema>;
export type AgentOutputInput = z.infer<typeof AgentOutputSchema>;
export type ImplementerOutputInput = z.infer<typeof ImplementerOutputSchema>;
export type ReviewerOutputInput = z.infer<typeof ReviewerOutputSchema>;

// ─── Validate Helpers ─────────────────────────────────────────────────────────

/**
 * Validate agent contract input
 */
export function validateAgentContract(data: unknown): AgentContractInput {
  return AgentContractSchema.parse(data);
}

/**
 * Validate council verdict input
 */
export function validateCouncilVerdictInput(data: unknown): CouncilVerdictInputData {
  return CouncilVerdictInputSchema.parse(data);
}

/**
 * Validate consensus config
 */
export function validateConsensusConfig(data: unknown): ConsensusConfigInput {
  return ConsensusConfigSchema.parse(data);
}

/**
 * Validate council verdict output
 */
export function validateCouncilVerdict(data: unknown): CouncilVerdictOutput {
  return CouncilVerdictSchema.parse(data);
}

/**
 * Validate a Claude agent file
 */
export function validateClaudeAgentFile(data: unknown): z.infer<typeof ClaudeAgentFileSchema> {
  return ClaudeAgentFileSchema.parse(data);
}

/**
 * Validate an OpenCode agent file
 */
export function validateOpenCodeAgentFile(data: unknown): z.infer<typeof OpenCodeAgentFileSchema> {
  return OpenCodeAgentFileSchema.parse(data);
}

/**
 * Validate goal graph
 */
export function validateGoalGraph(data: unknown): z.infer<typeof GoalGraphSchema> {
  return GoalGraphSchema.parse(data);
}

/**
 * Validate memory pointer
 */
export function validateMemoryPointer(data: unknown): z.infer<typeof MemoryPointerSchema> {
  return MemoryPointerSchema.parse(data);
}

/**
 * Validate memory index
 */
export function validateMemoryIndex(data: unknown): z.infer<typeof MemoryIndexSchema> {
  return MemoryIndexSchema.parse(data);
}

/**
 * Validate backlog document
 */
export function validateBacklogDocument(data: unknown): BacklogDocumentInput {
  return BacklogDocumentSchema.parse(data);
}

/**
 * Validate openspec state
 */
export function validateOpenspecState(data: unknown): OpenspecStateInput {
  return OpenspecStateSchema.parse(data);
}

export function validateScorecardRecord(data: unknown): ScorecardRecordInput {
  return ScorecardRecordSchema.parse(data);
}

export function validateTaskOutcome(data: unknown): TaskOutcomeInput {
  return TaskOutcomeSchema.parse(data);
}

export function validateCommandEnvelope(data: unknown): CommandEnvelopeInput {
  return CommandEnvelopeSchema.parse(data);
}

export function validateWorkflowProfile(data: unknown): WorkflowProfileInput {
  return WorkflowProfileSchema.parse(data);
}

export function validateExecutionContext(data: unknown): ExecutionContextInput {
  return ExecutionContextSchema.parse(data);
}

export function validatePlannerOutput(data: unknown): PlannerOutputInput {
  return PlannerOutputSchema.parse(data);
}

export function validateAgentOutput(data: unknown): AgentOutputInput {
  return AgentOutputSchema.parse(data);
}

export function validateImplementerOutput(data: unknown): ImplementerOutputInput {
  return ImplementerOutputSchema.parse(data);
}

export function validateReviewerOutput(data: unknown): ReviewerOutputInput {
  return ReviewerOutputSchema.parse(data);
}

export function validateProductGraph(data: unknown): ProductGraphInput {
  return ProductGraphSchema.parse(data);
}

export function validateKnowledgeEntity(data: unknown): KnowledgeEntityInput {
  return KnowledgeEntitySchema.parse(data);
}

export function validateDecision(data: unknown): DecisionInput {
  return DecisionSchema.parse(data);
}

export function validateEvidence(data: unknown): EvidenceInput {
  return EvidenceSchema.parse(data);
}

export function validateCanonicalTaskCard(data: unknown): CanonicalTaskCardInput {
  return CanonicalTaskCardSchema.parse(data);
}

export function validateProductEvent(data: unknown): ProductEventInput {
  return ProductEventSchema.parse(data);
}

