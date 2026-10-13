import type { ProjectScopeProfile } from '../../validation/scoped-context-schemas';

export interface SkillChoice {
  readonly id: string;
  readonly reason: string;
}

export interface SkillDiagnostic {
  readonly code: string;
  readonly severity: 'info';
  readonly message: string;
}

export interface SkillSelection {
  readonly selected: readonly SkillChoice[];
  readonly candidates: readonly SkillChoice[];
  readonly diagnostics: readonly SkillDiagnostic[];
}

const MIGRATION_PATH = /(^|\/)(migrations|db\/migrate)\/|\.sql$/;
const SQLX_PATH = /(^|\/)(migrations|\.sqlx)\/|\.sql$/;
const RUNTIMES = ['tokio', 'async-std'];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const depthOf = (root: string): number => (root === '.' ? 0 : root.split('/').length);

/** Deepest scope whose root contains the file. */
function ownerOf(file: string, scopes: readonly ProjectScopeProfile[]): ProjectScopeProfile | undefined {
  return scopes
    .filter((s) => s.root === '.' || file === s.root || file.startsWith(`${s.root}/`))
    .reduce<ProjectScopeProfile | undefined>((best, s) => (!best || depthOf(s.root) > depthOf(best.root) ? s : best), undefined);
}

/**
 * Pure, deterministic skill selection by file scope and role. Heuristic over
 * manifests and paths; an ambiguous sqlx boundary is reported, never guessed.
 */
export function selectSkills(input: {
  readonly files: readonly string[];
  readonly role: string;
  readonly scopes: readonly ProjectScopeProfile[];
}): SkillSelection {
  const selected = new Map<string, Set<string>>();
  const candidates = new Set<string>();
  const diagnostics = new Map<string, SkillDiagnostic>();
  const select = (id: string, reason: string): void => {
    selected.set(id, (selected.get(id) ?? new Set()).add(reason));
  };

  for (const raw of input.files) {
    const file = raw.replace(/\\/g, '/');
    const owner = ownerOf(file, input.scopes);
    const rust = owner?.language === 'rust';
    if (MIGRATION_PATH.test(file)) select('database-migrations', 'migration-path');
    if (!rust && !/\.rs$/.test(file) && file !== 'Cargo.toml' && !file.endsWith('/Cargo.toml')) continue;

    select('rust-engineering', 'rust-scope');
    const capabilities = new Set(rust ? owner.capabilities : []);
    if (RUNTIMES.some((name) => capabilities.has(name))) select('rust-async', 'declared-runtime');

    if (capabilities.has('sqlx')) {
      if (input.role === 'architect' || input.role === 'reviewer') select('rust-sqlx', 'role');
      else if (SQLX_PATH.test(file)) select('rust-sqlx', 'sqlx-boundary');
      else if (input.role === 'implementer' || input.role === 'tester') candidates.add(file);
    } else if (capabilities.has('dev:sqlx') && input.role === 'tester') {
      select('rust-sqlx', 'test-only');
    }
  }

  if (!selected.has('rust-sqlx') && candidates.size > 0) {
    const files = [...candidates].sort(byText).join(', ');
    diagnostics.set('sqlx_boundary_unknown', {
      code: 'sqlx_boundary_unknown',
      severity: 'info',
      message: `sqlx is declared but ${files} is not a known data-access boundary; rust-sqlx not selected`,
    });
  }

  return {
    selected: [...selected]
      .map(([id, reasons]) => ({ id, reason: [...reasons].sort(byText)[0]! }))
      .sort((a, b) => byText(a.id, b.id)),
    candidates:
      !selected.has('rust-sqlx') && candidates.size > 0 ? [{ id: 'rust-sqlx', reason: 'sqlx-boundary-unknown' }] : [],
    diagnostics: [...diagnostics.values()],
  };
}
