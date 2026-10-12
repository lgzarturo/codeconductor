import { z } from 'zod';

/** Relative path contained in the authorized root: no absolute, drive, backslash or `..` segments. */
const ContainedRelPath = z
  .string()
  .min(1)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !/^[A-Za-z]:/.test(p) &&
      !p.includes('\\') &&
      !p.includes('\0') &&
      !p.split('/').includes('..'),
    'path must be relative and contained in the authorized root',
  );

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const NonEmpty = z.string().trim().min(1);

export const RuleKindSchema = z.enum(['default', 'invariant']);

/** Origin class is assigned by the registry, never by the rule itself (strict). */
export const OriginClassSchema = z.enum(['engine', 'stack', 'repository', 'task']);

export const ScopedRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
    kind: RuleKindSchema,
    scopeRoot: z.union([z.literal('.'), ContainedRelPath]),
    paths: z
      .object({
        files: z.array(ContainedRelPath).default([]),
        subtrees: z.array(ContainedRelPath).default([]),
      })
      .strict()
      .default({ files: [], subtrees: [] }),
    when: z
      .object({
        languages: z.array(NonEmpty).optional(),
        roles: z.array(NonEmpty).optional(),
      })
      .strict()
      .default({}),
    trigger: NonEmpty,
    action: NonEmpty,
    reason: NonEmpty,
    exceptions: NonEmpty,
    verification: z
      .object({ recipeIds: z.array(NonEmpty).min(1) })
      .strict(),
    references: z.array(NonEmpty).default([]),
  })
  .strict();

export const ScopedRuleFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    rules: z.array(ScopedRuleSchema).min(1),
  })
  .strict();

export const RecipeStatusSchema = z.enum(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']);

export const RecipeStepSchema = z
  .object({
    executable: z.string().regex(/^[A-Za-z0-9_-]+$/),
    argv: z.array(z.string().refine((a) => !a.includes('\0'))),
    cwd: z.union([z.literal('.'), ContainedRelPath]),
    timeoutSeconds: z.number().int().min(1).max(3600),
    expectedExitCodes: z.array(z.number().int()).min(1),
    environment: z.record(z.string()).default({}),
  })
  .strict();

export const VerificationRecipeSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    version: z.number().int().min(1),
    scope: z
      .object({
        workspaceRoot: z.union([z.literal('.'), ContainedRelPath]),
        manifest: ContainedRelPath,
        package: NonEmpty.optional(),
      })
      .strict(),
    prerequisites: z
      .object({
        tools: z.array(NonEmpty),
        lockfileRequired: z.boolean(),
        dependencyCacheRequired: z.boolean(),
      })
      .strict(),
    steps: z.array(RecipeStepSchema).min(1),
    evidence: z
      .object({
        requireObservedExecution: z.literal(true),
        requireCandidateUnchanged: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const ContextManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    scope: z.object({ files: z.array(ContainedRelPath), role: NonEmpty }).strict(),
    profiles: z.array(z.unknown()),
    skills: z.array(z.object({ id: NonEmpty, version: NonEmpty }).strict()),
    rules: z.array(
      z
        .object({
          id: NonEmpty,
          kind: RuleKindSchema,
          originClass: OriginClassSchema,
          scopeRoot: z.string(),
          depth: z.number().int().min(0),
          sourcePath: NonEmpty,
          contentHash: Sha256,
        })
        .strict(),
    ),
    overrides: z.array(z.object({ id: NonEmpty, winner: NonEmpty, loser: NonEmpty }).strict()),
    omittedReferences: z.array(z.object({ ref: NonEmpty, reason: NonEmpty }).strict()),
    diagnostics: z.array(
      z
        .object({
          code: NonEmpty,
          severity: z.enum(['info', 'warning', 'blocking']),
          message: NonEmpty,
        })
        .strict(),
    ),
    budget: z
      .object({ maxBytes: z.number().int().min(0), usedBytes: z.number().int().min(0) })
      .strict(),
    hash: Sha256,
  })
  .strict();

export const DetectionStatusSchema = z.enum(['confirmed', 'indicative', 'inconclusive', 'absent']);

export const DependencyEvidenceSchema = z
  .object({
    file: NonEmpty,
    section: NonEmpty,
    key: NonEmpty,
    name: NonEmpty,
    alias: NonEmpty.optional(),
    category: z.enum(['normal', 'dev', 'build']),
    optional: z.boolean(),
    features: z.array(z.string()),
    defaultFeatures: z.boolean(),
    target: z.string().optional(),
    owner: NonEmpty,
    resolution: z.enum(['declared', 'workspace-inherited', 'unresolved']),
  })
  .strict();

export const ProjectScopeProfileSchema = z
  .object({
    root: z.string(),
    language: NonEmpty,
    status: DetectionStatusSchema,
    packages: z.array(
      z.object({ name: NonEmpty, manifest: NonEmpty, workspaceRoot: z.string().optional() }).strict(),
    ),
    capabilities: z.array(z.string()),
    declaredDatabaseBackends: z.array(z.string()),
    dependencyEvidence: z.array(DependencyEvidenceSchema),
    diagnostics: z.array(z.object({ code: NonEmpty, message: NonEmpty }).strict()),
  })
  .strict();

export type ScopedRule = z.infer<typeof ScopedRuleSchema>;
export type VerificationRecipe = z.infer<typeof VerificationRecipeSchema>;
export type RecipeStatus = z.infer<typeof RecipeStatusSchema>;
export type ContextManifest = z.infer<typeof ContextManifestSchema>;
export type ProjectScopeProfile = z.infer<typeof ProjectScopeProfileSchema>;
