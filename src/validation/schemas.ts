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
  agentId: z.string(),
  agentRole: z.string(),
  status: z.enum(['APPROVED', 'REJECTED', 'ABSTAIN']),
  securityVeto: z.boolean(),
  findings: z.array(CouncilFindingSchema),
  summary: z.string(),
});

/**
 * Consensus config schema
 */
export const ConsensusConfigSchema = z.object({
  algorithm: z.enum(['majority', 'unanimous']),
  allowSecurityVeto: z.boolean(),
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
  vetoByAgentId: z.string().optional(),
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
});

/**
 * Goal graph schema — a complete goal with task dependencies
 */
export const GoalGraphSchema = z.object({
  objective: z.string(),
  tasks: z.array(GoalTaskSchema),
  created_at: z.string(),
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

