import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  buildContextManifest,
  checkReferences,
  loadRuleSources,
  resolveScopedRules,
  type OriginClass,
  type RuleSource,
} from '../../../../src/core/ccep/scoped-rules';
import { ContextManifestSchema, type ScopedRule } from '../../../../src/validation/scoped-context-schemas';

const ID = 'rust.errors.application-boundary';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const rule = (over: Partial<ScopedRule> = {}): ScopedRule => ({
  id: ID,
  kind: 'default',
  scopeRoot: '.',
  paths: { files: [], subtrees: [] },
  when: {},
  trigger: 'trigger',
  action: 'action',
  reason: 'reason',
  exceptions: 'exceptions',
  verification: { recipeIds: ['check'] },
  references: [],
  ...over,
});
const source = (originClass: OriginClass, sourcePath: string, rules: ScopedRule[]): RuleSource => ({
  originClass,
  sourcePath,
  contentHash: sha(sourcePath + JSON.stringify(rules)),
  rules,
});
const resolve = (files: string[], sources: RuleSource[], role = 'implementer') =>
  resolveScopedRules({ files, role, sources, languagesOf: () => ['rust'] });
const actions = (r: ReturnType<typeof resolve>) => r.effective.map((e) => e.rule.action).sort();
const codes = (r: ReturnType<typeof resolve>) => r.diagnostics.map((d) => d.code);

const FILE = 'crates/service/src/http/error.rs';

describe('R01 nearest-rule-wins por profundidad dentro de la misma clase', () => {
  const sources = [
    source('repository', 'r/root.yml', [rule({ action: 'root' })]),
    source('repository', 'r/crate.yml', [rule({ action: 'crate', scopeRoot: 'crates/service' })]),
    source('repository', 'r/module.yml', [rule({ action: 'module', scopeRoot: 'crates/service/src/http' })]),
  ];

  test('gana el scopeRoot ancestro más cercano y se registran los perdedores', () => {
    const r = resolve([FILE], sources);
    expect(actions(r)).toEqual(['module']);
    expect(r.overrides.map((o) => o.loser).sort()).toEqual(['r/crate.yml', 'r/root.yml']);
    expect(r.overrides.every((o) => o.winner === 'r/module.yml' && o.id === ID)).toBe(true);
  });

  test('un archivo fuera del subárbol más profundo usa la regla del ámbito que sí lo contiene', () => {
    expect(actions(resolve(['crates/service/src/lib.rs'], sources))).toEqual(['crate']);
    expect(actions(resolve(['crates/other/src/lib.rs'], sources))).toEqual(['root']);
  });
});

describe('R02 empates incompatibles', () => {
  const a = source('repository', 'r/a.yml', [rule({ action: 'A' })]);
  const b = source('repository', 'r/b.yml', [rule({ action: 'B' })]);

  test('misma clase y profundidad con valores distintos: conflicto bloqueante sin desempate', () => {
    for (const sources of [[a, b], [b, a]]) {
      const r = resolve([FILE], sources);
      expect(codes(r)).toContain('rule_conflict');
      expect(r.blocked).toBe(true);
      expect(r.effective.filter((e) => e.rule.id === ID)).toEqual([]);
    }
  });

  test('definiciones idénticas se deduplican conservando ambas procedencias', () => {
    const r = resolve([FILE], [source('repository', 'r/a.yml', [rule()]), source('repository', 'r/b.yml', [rule()])]);
    expect(r.blocked).toBe(false);
    expect(r.effective).toHaveLength(1);
    expect(r.effective[0]!.provenance.map((p) => p.sourcePath).sort()).toEqual(['r/a.yml', 'r/b.yml']);
  });
});

describe('R03 invariantes', () => {
  const inv = source('repository', 'r/inv.yml', [rule({ id: 'data.persisted-values', kind: 'invariant', action: 'keep' })]);

  test('un default local con el id de una invariante bloquea y la invariante se conserva', () => {
    const local = source('repository', 'r/local.yml', [
      rule({ id: 'data.persisted-values', action: 'relax', scopeRoot: 'crates/service' }),
    ]);
    const r = resolve([FILE], [inv, local]);
    expect(codes(r)).toContain('invariant_overridden');
    expect(r.blocked).toBe(true);
    expect(actions(r)).toEqual(['keep']);
  });

  test('una regla de clase task tampoco puede degradar una invariante (sin excepciones en v1)', () => {
    const task = source('task', 'task:cli', [rule({ id: 'data.persisted-values', action: 'relax' })]);
    const r = resolve([FILE], [inv, task]);
    expect(codes(r)).toContain('invariant_overridden');
    expect(actions(r)).toEqual(['keep']);
  });

  test('las invariantes con ids distintos se acumulan', () => {
    const two = source('repository', 'r/two.yml', [
      rule({ id: 'a.one', kind: 'invariant', action: '1' }),
      rule({ id: 'a.two', kind: 'invariant', action: '2' }),
    ]);
    expect(actions(resolve([FILE], [two]))).toEqual(['1', '2']);
  });
});

describe('R04 varios crates y rename', () => {
  const sources = [
    source('repository', 'r/a.yml', [rule({ action: 'for-a', scopeRoot: 'crates/a' })]),
    source('repository', 'r/b.yml', [rule({ action: 'for-b', scopeRoot: 'crates/b' })]),
  ];

  test('la regla de un crate no gobierna al otro', () => {
    const r = resolve(['crates/a/src/lib.rs', 'crates/b/src/lib.rs'], sources);
    const byAction = Object.fromEntries(r.effective.map((e) => [e.rule.action, e.appliesTo]));
    expect(byAction).toEqual({ 'for-a': ['crates/a/src/lib.rs'], 'for-b': ['crates/b/src/lib.rs'] });
  });

  test('rename entre ámbitos registra origen y destino con sus reglas respectivas', () => {
    const r = resolve(['crates/a/src/old.rs', 'crates/b/src/new.rs'], sources);
    expect(r.effective.map((e) => `${e.rule.action}:${e.appliesTo.join()}`).sort()).toEqual([
      'for-a:crates/a/src/old.rs',
      'for-b:crates/b/src/new.rs',
    ]);
  });

  test('una regla común acumula todos los archivos a los que aplica', () => {
    const common = source('repository', 'r/c.yml', [rule({ action: 'common' })]);
    const r = resolve(['crates/a/x.rs', 'crates/b/y.rs'], [common]);
    expect(r.effective[0]!.appliesTo).toEqual(['crates/a/x.rs', 'crates/b/y.rs']);
  });
});

describe('R05 contención de rutas', () => {
  const common = source('repository', 'r/c.yml', [rule()]);

  test.each(['../outside.rs', '/etc/passwd', 'a/../../b.rs', 'C:\\x\\y.rs'])('rechaza el archivo %s', (file) => {
    const r = resolve([file], [common]);
    expect(codes(r)).toContain('path_escape');
    expect(r.blocked).toBe(true);
    expect(r.effective).toEqual([]);
  });

  test('separadores Windows equivalen a POSIX y se registra la ruta normalizada', () => {
    const scoped = source('repository', 'r/a.yml', [rule({ scopeRoot: 'crates/a' })]);
    const r = resolve(['crates\\a\\src\\lib.rs'], [scoped]);
    expect(r.blocked).toBe(false);
    expect(r.effective[0]!.appliesTo).toEqual(['crates/a/src/lib.rs']);
  });

  test('un symlink de reglas que escapa de la raíz es ilegible, no se sigue', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cc-rules-'));
    const outside = await mkdtemp(join(tmpdir(), 'cc-rules-out-'));
    try {
      await mkdir(join(root, '.codeconductor/rules'), { recursive: true });
      await writeFile(join(outside, 'evil.yml'), 'schemaVersion: 1\nrules: []\n');
      await symlink(join(outside, 'evil.yml'), join(root, '.codeconductor/rules/evil.yml'));
      const { sources, diagnostics } = await loadRuleSources(root);
      expect(sources).toEqual([]);
      expect(diagnostics.map((d) => d.code)).toContain('rule_source_unreadable');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('R06 nada se omite en silencio', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cc-rules-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const put = async (rel: string, content: string) => {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), content);
  };
  const validFile = `schemaVersion: 1
rules:
  - id: rust.errors.application-boundary
    kind: default
    scopeRoot: .
    trigger: t
    action: a
    reason: r
    exceptions: e
    verification: { recipeIds: [check] }
    references: [docs/adr/error-contract.md, docs/adr/present.md]
`;

  test('sin directorio de reglas no hay fuentes ni diagnósticos', async () => {
    expect(await loadRuleSources(root)).toEqual({ sources: [], diagnostics: [] });
  });

  test('carga reglas válidas como clase repository con hash del contenido', async () => {
    await put('.codeconductor/rules/service.yml', validFile);
    const { sources, diagnostics } = await loadRuleSources(root);
    expect(diagnostics).toEqual([]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      originClass: 'repository',
      sourcePath: '.codeconductor/rules/service.yml',
      contentHash: sha(validFile),
    });
  });

  test.each([
    ['YAML inválido', 'rules: [unclosed'],
    ['schema inválido (falta acción)', 'schemaVersion: 1\nrules:\n  - id: a.b\n    kind: default\n'],
  ])('un archivo con %s produce diagnóstico bloqueante y no se descarta en silencio', async (_n, body) => {
    await put('.codeconductor/rules/good.yml', validFile);
    await put('.codeconductor/rules/bad.yml', body);
    const { sources, diagnostics } = await loadRuleSources(root);
    expect(sources.map((s) => s.sourcePath)).toEqual(['.codeconductor/rules/good.yml']);
    expect(diagnostics).toMatchObject([{ code: 'rule_source_invalid', severity: 'blocking' }]);
  });

  test('una referencia inexistente queda registrada como omitida, no bloquea', async () => {
    await put('.codeconductor/rules/service.yml', validFile);
    await put('docs/adr/present.md', '# adr');
    const { sources } = await loadRuleSources(root);
    const r = resolve(['src/lib.rs'], sources);
    expect(await checkReferences(root, r.effective)).toEqual([
      { ref: 'docs/adr/error-contract.md', reason: 'missing' },
    ]);
  });
});

describe('aplicabilidad por rol, lenguaje y rutas', () => {
  test('when.roles filtra por rol', () => {
    const s = source('repository', 'r/a.yml', [rule({ when: { roles: ['reviewer'] } })]);
    expect(resolve([FILE], [s], 'implementer').effective).toEqual([]);
    expect(resolve([FILE], [s], 'reviewer').effective).toHaveLength(1);
  });

  test('when.languages filtra por el lenguaje del archivo', () => {
    const s = source('repository', 'r/a.yml', [rule({ when: { languages: ['python'] } })]);
    expect(resolve([FILE], [s]).effective).toEqual([]);
  });

  test('paths.files y paths.subtrees son relativos al scopeRoot', () => {
    const s = source('repository', 'r/a.yml', [
      rule({ scopeRoot: 'crates/service', paths: { files: ['build.rs'], subtrees: ['src/http'] } }),
    ]);
    const applies = (f: string) => resolve([f], [s]).effective.length === 1;
    expect(applies('crates/service/build.rs')).toBe(true);
    expect(applies('crates/service/src/http/error.rs')).toBe(true);
    expect(applies('crates/service/src/db/pool.rs')).toBe(false);
    expect(applies('crates/service/src/httpx/a.rs')).toBe(false);
    expect(applies('crates/other/build.rs')).toBe(false);
  });
});

describe('R09/R10 clase de origen', () => {
  test('repository gana a stack aunque la regla del stack sea más profunda, sin importar el orden', () => {
    const stack = source('stack', 's/rust.yml', [rule({ action: 'stack', scopeRoot: 'crates/service' })]);
    const repo = source('repository', 'r/root.yml', [rule({ action: 'repo' })]);
    for (const sources of [[stack, repo], [repo, stack]]) expect(actions(resolve([FILE], sources))).toEqual(['repo']);
  });

  test('task > repository > stack > engine para el mismo id', () => {
    const all: RuleSource[] = (['engine', 'stack', 'repository', 'task'] as const).map((c) =>
      source(c, `${c}.yml`, [rule({ action: c })]),
    );
    expect(actions(resolve([FILE], all))).toEqual(['task']);
    expect(actions(resolve([FILE], all.slice(0, 3)))).toEqual(['repository']);
  });

  test('dos skills stack incompatibles con la misma prioridad: conflicto estable, no desempata por nombre', () => {
    const a = source('stack', 's/zzz.yml', [rule({ action: 'A' })]);
    const b = source('stack', 's/aaa.yml', [rule({ action: 'B' })]);
    for (const sources of [[a, b], [b, a]]) {
      const r = resolve([FILE], sources);
      expect(codes(r)).toEqual(['rule_conflict']);
      expect(r.blocked).toBe(true);
    }
  });
});

describe('manifiesto: procedencia, hash y determinismo (R07/R08)', () => {
  const sources = [
    source('repository', 'r/root.yml', [rule({ action: 'root' }), rule({ id: 'x.one', action: 'x' })]),
    source('repository', 'r/crate.yml', [rule({ action: 'crate', scopeRoot: 'crates/service' })]),
  ];
  const manifest = (files: string[], srcs: RuleSource[]) =>
    buildContextManifest({
      resolution: resolve(files, srcs),
      files,
      role: 'implementer',
      budget: { maxBytes: 4000, usedBytes: 100 },
    });

  test('cumple el schema y registra clase, profundidad, procedencia y hash de contenido', () => {
    const m = manifest([FILE, 'crates/service/src/lib.rs'], sources);
    expect(ContextManifestSchema.safeParse(m).success).toBe(true);
    const crate = m.rules.find((r) => r.id === ID)!;
    expect(crate).toMatchObject({ originClass: 'repository', depth: 2, sourcePath: 'r/crate.yml' });
    expect(crate.contentHash).toBe(sources[1]!.contentHash);
    expect(m.overrides.map((o) => o.loser)).toEqual(['r/root.yml']);
  });

  test('R07: el orden de archivos y de fuentes no cambia el hash', () => {
    const a = manifest([FILE, 'crates/service/src/lib.rs'], sources);
    const b = manifest(['crates/service/src/lib.rs', FILE], [...sources].reverse());
    expect(b.hash).toBe(a.hash);
    expect(b).toEqual(a);
  });

  test('R08: una regla irrelevante de otro package no cambia la selección ni el hash', () => {
    const noise = source('repository', 'r/zzz.yml', [rule({ id: 'zz.other', scopeRoot: 'crates/zzz' })]);
    expect(manifest([FILE], [...sources, noise]).hash).toBe(manifest([FILE], sources).hash);
  });

  test('el manifiesto es canónico aunque la resolución llegue desordenada', () => {
    const files = [FILE];
    const deep = [
      ...sources,
      source('repository', 'r/module.yml', [rule({ action: 'module', scopeRoot: 'crates/service/src/http' })]),
    ];
    const res = resolve(files, deep);
    expect(res.overrides).toHaveLength(2);
    const shuffled = { ...res, effective: [...res.effective].reverse(), overrides: [...res.overrides].reverse() };
    const build = (resolution: typeof res) =>
      buildContextManifest({ resolution, files, role: 'implementer', budget: { maxBytes: 4000, usedBytes: 100 } });
    expect(build(shuffled).hash).toBe(build(res).hash);
  });

  test('un cambio real de regla cambia el hash', () => {
    const changed = [sources[0]!, { ...sources[1]!, contentHash: sha('different') }];
    expect(manifest([FILE], changed).hash).not.toBe(manifest([FILE], sources).hash);
  });
});
