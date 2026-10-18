import { describe, expect, test } from 'bun:test';
import { classifyRisk } from '../../../../src/core/ccep/risk-classifier';
import { selectSkills } from '../../../../src/core/ccep/skill-selector';
import type { ProjectScopeProfile } from '../../../../src/validation/scoped-context-schemas';

const scope = (
  root: string,
  language: string,
  capabilities: string[] = [],
  status: ProjectScopeProfile['status'] = 'confirmed',
): ProjectScopeProfile => ({
  root,
  language,
  status,
  packages: [],
  capabilities,
  declaredDatabaseBackends: [],
  dependencyEvidence: [],
  diagnostics: [],
});

const ids = (r: { selected: readonly { id: string }[] }) => r.selected.map((s) => s.id);
const run = (files: string[], role: string, scopes: ProjectScopeProfile[]) => selectSkills({ files, role, scopes });

describe('selectSkills — tabla de selección', () => {
  test('S01 .rs en scope Rust sin capabilities: solo rust-engineering', () => {
    expect(ids(run(['src/lib.rs'], 'implementer', [scope('.', 'rust')]))).toEqual(['rust-engineering']);
  });

  test('S01 Cargo.toml también activa rust-engineering', () => {
    expect(ids(run(['Cargo.toml'], 'implementer', [scope('.', 'rust')]))).toEqual(['rust-engineering']);
  });

  test('S01 archivo no-.rs dentro de un scope Rust activa rust-engineering', () => {
    expect(ids(run(['README.md'], 'implementer', [scope('.', 'rust')]))).toEqual(['rust-engineering']);
  });

  test('S01 tokio normal añade rust-async con reason declared-runtime', () => {
    const r = run(['src/lib.rs'], 'implementer', [scope('.', 'rust', ['tokio'])]);
    expect(ids(r)).toEqual(['rust-async', 'rust-engineering']);
    expect(r.selected.find((s) => s.id === 'rust-async')?.reason).toBe('declared-runtime');
  });

  test('S01 async-std normal también añade rust-async', () => {
    expect(ids(run(['src/lib.rs'], 'implementer', [scope('.', 'rust', ['async-std'])]))).toContain('rust-async');
  });

  test('S01 tokio solo en dev: no selecciona rust-async', () => {
    expect(ids(run(['src/lib.rs'], 'implementer', [scope('.', 'rust', ['dev:tokio'])]))).toEqual(['rust-engineering']);
  });

  test('S01 sqlx normal + architect/reviewer selecciona rust-sqlx', () => {
    for (const role of ['architect', 'reviewer']) {
      expect(ids(run(['src/lib.rs'], role, [scope('.', 'rust', ['sqlx'])]))).toContain('rust-sqlx');
    }
  });

  test('S01 sqlx normal + archivo de migraciones / .sql / .sqlx selecciona rust-sqlx', () => {
    for (const file of ['migrations/001_init.sql', 'queries/q.sql', '.sqlx/query-abc.json']) {
      expect(ids(run([file], 'implementer', [scope('.', 'rust', ['sqlx'])]))).toContain('rust-sqlx');
    }
  });

  test('S01 sqlx normal + otro archivo + implementer/tester: candidate con sqlx_boundary_unknown, no seleccionada', () => {
    for (const role of ['implementer', 'tester']) {
      const r = run(['src/lib.rs'], role, [scope('.', 'rust', ['sqlx'])]);
      expect(ids(r)).not.toContain('rust-sqlx');
      expect(r.candidates.map((c) => c.id)).toEqual(['rust-sqlx']);
      expect(r.diagnostics.map((d) => d.code)).toEqual(['sqlx_boundary_unknown']);
    }
  });

  test('S01 solo dev:sqlx: rust-sqlx únicamente para tester, con reason test-only', () => {
    const tester = run(['tests/db.rs'], 'tester', [scope('.', 'rust', ['dev:sqlx'])]);
    expect(tester.selected.find((s) => s.id === 'rust-sqlx')?.reason).toBe('test-only');
    for (const role of ['implementer', 'architect', 'reviewer']) {
      const r = run(['tests/db.rs'], role, [scope('.', 'rust', ['dev:sqlx'])]);
      expect(ids(r)).not.toContain('rust-sqlx');
      expect(r.candidates).toEqual([]);
    }
  });

  test('S01 migraciones en cualquier lenguaje activan database-migrations', () => {
    for (const file of ['db/migrations/001.sql', 'db/migrate/20240101_x.rb', 'schema/dump.sql']) {
      expect(ids(run([file], 'implementer', [scope('.', 'node')]))).toEqual(['database-migrations']);
    }
  });

  test('S01 scope Node sin Rust: ninguna de las cuatro', () => {
    expect(run(['src/app.ts'], 'architect', [scope('.', 'node', ['sqlx'])])).toEqual({
      selected: [],
      candidates: [],
      diagnostics: [],
    });
  });
});

describe('selectSkills — ámbito', () => {
  test('S01 la raíz más profunda gana: ejemplo Rust anidado en Node usa solo las capabilities de su scope', () => {
    const scopes = [scope('.', 'node'), scope('services/engine', 'rust', ['tokio'])];
    expect(ids(run(['services/engine/src/lib.rs'], 'implementer', scopes))).toEqual(['rust-async', 'rust-engineering']);
    expect(ids(run(['web/app.ts'], 'implementer', scopes))).toEqual([]);
  });

  test('S01 un scope Node anidado en Rust excluye sus archivos no-.rs', () => {
    const scopes = [scope('.', 'rust', ['tokio']), scope('web', 'node')];
    expect(ids(run(['web/app.ts'], 'implementer', scopes))).toEqual([]);
  });

  test('S01 las capabilities de otro package no se filtran al archivo', () => {
    const scopes = [scope('crates/a', 'rust', ['tokio']), scope('crates/b', 'rust')];
    expect(ids(run(['crates/b/src/lib.rs'], 'implementer', scopes))).toEqual(['rust-engineering']);
    expect(ids(run(['crates/a/src/lib.rs'], 'implementer', scopes))).toContain('rust-async');
  });

  test('S01 .rs con scope indicative selecciona rust-engineering', () => {
    expect(ids(run(['src/lib.rs'], 'implementer', [scope('.', 'rust', [], 'indicative')]))).toEqual(['rust-engineering']);
  });

  test('S01 .rs sin scope alguno selecciona rust-engineering', () => {
    expect(ids(run(['src/lib.rs'], 'implementer', []))).toEqual(['rust-engineering']);
  });
});

describe('selectSkills — determinismo y riesgo', () => {
  test('S01 el resultado no depende del orden de archivos ni de scopes', () => {
    const files = ['crates/a/src/lib.rs', 'migrations/1.sql', 'crates/b/Cargo.toml'];
    const scopes = [scope('.', 'rust'), scope('crates/a', 'rust', ['tokio', 'sqlx']), scope('crates/b', 'rust')];
    const base = run(files, 'implementer', scopes);
    expect(run([...files].reverse(), 'implementer', [...scopes].reverse())).toEqual(base);
    expect(run([files[1]!, files[2]!, files[0]!], 'implementer', [scopes[2]!, scopes[0]!, scopes[1]!])).toEqual(base);
  });

  test('S01 migración detectada como riesgo high junto a la selección database-migrations', () => {
    const files = ['db/migrations/001.sql'];
    expect(ids(run(files, 'implementer', []))).toContain('database-migrations');
    expect(classifyRisk({ targetFiles: files })).toBe('high');
  });
});
