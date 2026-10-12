import { describe, expect, test } from 'bun:test';
import {
  ContextManifestSchema,
  ProjectScopeProfileSchema,
  RecipeStatusSchema,
  ScopedRuleFileSchema,
  VerificationRecipeSchema,
} from '../../../src/validation/scoped-context-schemas';
import { validateProjectProfile } from '../../../src/validation/schemas';

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'rust.errors.application-boundary',
  kind: 'default',
  scopeRoot: 'crates/service',
  paths: { files: [], subtrees: ['src'] },
  when: { languages: ['rust'], roles: ['implementer'] },
  trigger: 'Se modifica un límite fallible.',
  action: 'Conservar el tipo de error público.',
  reason: 'Los consumidores distinguen errores recuperables.',
  exceptions: 'Cambiar el contrato requiere Task Card.',
  verification: { recipeIds: ['service-contract-tests'] },
  references: [],
  ...over,
});
const file = (rules: unknown[]) => ({ schemaVersion: 1, rules });

const recipe = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'rust-package-check',
  version: 1,
  scope: { workspaceRoot: '.', manifest: 'Cargo.toml', package: 'service' },
  prerequisites: { tools: ['cargo'], lockfileRequired: true, dependencyCacheRequired: true },
  steps: [
    {
      executable: 'cargo',
      argv: ['check', '--locked', '--offline', '-p', 'service'],
      cwd: '.',
      timeoutSeconds: 180,
      expectedExitCodes: [0],
      environment: {},
    },
  ],
  evidence: { requireObservedExecution: true, requireCandidateUnchanged: true },
  ...over,
});

describe('ScopedRuleFileSchema (contrato: regla = condición, acción, excepción, verificación)', () => {
  test('acepta una regla completa', () => {
    expect(ScopedRuleFileSchema.safeParse(file([rule()])).success).toBe(true);
  });

  test.each(['trigger', 'action', 'exceptions'])('rechaza regla sin %s', (key) => {
    const r = rule();
    delete (r as Record<string, unknown>)[key];
    expect(ScopedRuleFileSchema.safeParse(file([r])).success).toBe(false);
  });

  test('rechaza regla sin verificación alguna', () => {
    expect(
      ScopedRuleFileSchema.safeParse(file([rule({ verification: { recipeIds: [] } })])).success,
    ).toBe(false);
  });

  test('una regla no puede declarar su propia clase de origen', () => {
    expect(ScopedRuleFileSchema.safeParse(file([rule({ origin: 'engine' })])).success).toBe(false);
  });

  test.each(['../outside', '/abs/path', 'a/../../b', 'C:\\x'])(
    'rechaza scopeRoot que escapa de la raíz: %s',
    (scopeRoot) => {
      expect(ScopedRuleFileSchema.safeParse(file([rule({ scopeRoot })])).success).toBe(false);
    },
  );

  test('rechaza kind desconocido y schemaVersion distinta de 1', () => {
    expect(ScopedRuleFileSchema.safeParse(file([rule({ kind: 'preference' })])).success).toBe(false);
    expect(ScopedRuleFileSchema.safeParse({ schemaVersion: 2, rules: [rule()] }).success).toBe(false);
  });
});

describe('VerificationRecipeSchema (argv sin shell, cwd acotado)', () => {
  test('acepta la recipe de ejemplo', () => {
    expect(VerificationRecipeSchema.safeParse(recipe()).success).toBe(true);
  });

  test.each(['cargo check', 'cargo;rm', '/usr/bin/cargo', '$(x)', '../cargo'])(
    'rechaza executable con forma de shell o ruta: %s',
    (executable) => {
      const r = recipe();
      (r.steps[0] as Record<string, unknown>).executable = executable;
      expect(VerificationRecipeSchema.safeParse(r).success).toBe(false);
    },
  );

  test('rechaza cwd fuera de la raíz', () => {
    const r = recipe();
    (r.steps[0] as Record<string, unknown>).cwd = '../elsewhere';
    expect(VerificationRecipeSchema.safeParse(r).success).toBe(false);
  });

  test('exige timeout explícito y acotado', () => {
    const r = recipe();
    delete (r.steps[0] as Record<string, unknown>).timeoutSeconds;
    expect(VerificationRecipeSchema.safeParse(r).success).toBe(false);
    (r.steps[0] as Record<string, unknown>).timeoutSeconds = 100000;
    expect(VerificationRecipeSchema.safeParse(r).success).toBe(false);
  });

  test('exige ejecución observada como evidencia', () => {
    const r = recipe({ evidence: { requireObservedExecution: false, requireCandidateUnchanged: true } });
    expect(VerificationRecipeSchema.safeParse(r).success).toBe(false);
  });

  test('solo existen los estados PASS/FAIL/BLOCKED/SKIPPED', () => {
    for (const s of ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']) {
      expect(RecipeStatusSchema.safeParse(s).success).toBe(true);
    }
    expect(RecipeStatusSchema.safeParse('PASSED').success).toBe(false);
    expect(RecipeStatusSchema.safeParse('pass').success).toBe(false);
  });
});

describe('ContextManifestSchema', () => {
  const manifest = (over: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    scope: { files: ['crates/service/src/lib.rs'], role: 'implementer' },
    profiles: [],
    skills: [{ id: 'rust-engineering', version: '1' }],
    rules: [
      {
        id: 'rust.errors.application-boundary',
        kind: 'default',
        originClass: 'repository',
        scopeRoot: 'crates/service',
        depth: 2,
        sourcePath: '.codeconductor/rules/service.yml',
        contentHash: 'a'.repeat(64),
      },
    ],
    overrides: [],
    omittedReferences: [],
    diagnostics: [],
    budget: { maxBytes: 4000, usedBytes: 120 },
    hash: 'b'.repeat(64),
    ...over,
  });

  test('acepta un manifiesto con procedencia y hash', () => {
    expect(ContextManifestSchema.safeParse(manifest()).success).toBe(true);
  });

  test('rechaza regla efectiva sin hash de contenido sha256', () => {
    const m = manifest();
    (m.rules[0] as Record<string, unknown>).contentHash = 'nothex';
    expect(ContextManifestSchema.safeParse(m).success).toBe(false);
  });

  test('rechaza una clase de origen fuera de engine/stack/repository/task', () => {
    const m = manifest();
    (m.rules[0] as Record<string, unknown>).originClass = 'user';
    expect(ContextManifestSchema.safeParse(m).success).toBe(false);
  });

  test('un manifiesto sin hash canónico es inválido', () => {
    const m = manifest();
    delete (m as Record<string, unknown>).hash;
    expect(ContextManifestSchema.safeParse(m).success).toBe(false);
  });
});

describe('ProjectProfile: compatibilidad aditiva', () => {
  const legacy = {
    rootDir: '/p',
    languages: ['rust'],
    runtimes: ['rust'],
    packageManagers: [],
    frameworks: ['backend'],
    signals: ['Cargo.toml'],
    confidence: 'medium',
  };

  test('un perfil legacy sin campos nuevos sigue siendo válido', () => {
    expect(validateProjectProfile(legacy)).toEqual(legacy);
  });

  test('acepta perfiles por ámbito con evidencia de dependencias', () => {
    const scope = {
      root: 'crates/service',
      language: 'rust',
      status: 'confirmed',
      packages: [{ name: 'service', manifest: 'crates/service/Cargo.toml' }],
      capabilities: ['sqlx'],
      declaredDatabaseBackends: ['postgres'],
      dependencyEvidence: [
        {
          file: 'crates/service/Cargo.toml',
          section: 'dependencies',
          key: 'db',
          name: 'sqlx',
          alias: 'db',
          category: 'normal',
          optional: false,
          features: ['postgres'],
          defaultFeatures: true,
          owner: 'service',
          resolution: 'declared',
        },
      ],
      diagnostics: [],
    };
    expect(ProjectScopeProfileSchema.safeParse(scope).success).toBe(true);
    expect(validateProjectProfile({ ...legacy, scopes: [scope] }).scopes).toHaveLength(1);
  });

  test('rechaza estado de detección fuera de confirmed/indicative/inconclusive/absent', () => {
    const bad = { root: '.', language: 'rust', status: 'sure', packages: [], capabilities: [], declaredDatabaseBackends: [], dependencyEvidence: [], diagnostics: [] };
    expect(ProjectScopeProfileSchema.safeParse(bad).success).toBe(false);
  });
});
