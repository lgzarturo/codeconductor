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
 * CodeConductor config schema
 */
export const CodeConductorConfigSchema = z.object({
  version: z.string(),
  project: z.object({
    name: z.string(),
    profile: z.string().optional(),
  }),
  defaults: z.object({
    target: z.enum(['opencode', 'claude', 'codex', 'gemini', 'cursor']),
    overwrite: z.boolean(),
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
  }),
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
  target: z.enum(['opencode', 'claude', 'codex', 'gemini', 'cursor']),
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
  target: z.enum(['opencode', 'claude', 'codex', 'gemini', 'cursor']),
  agents: z.record(
    z.string(),
    z.object({
      claude: z.string().optional(),
      opencode: z.string().optional(),
      codex: z.string().optional(),
      gemini: z.string().optional(),
      cursor: z.string().optional(),
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
