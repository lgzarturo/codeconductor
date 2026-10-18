import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { detectRust } from '../../../../src/core/detection/detectors/rust';
import { detectProject } from '../../../../src/core/detection/project-detector';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cc-rust-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel: string, content = ''): Promise<void> {
  const p = join(root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content);
}
const pkg = (name: string, extra = '') =>
  `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n${extra}`;

const byRoot = async () => {
  const d = await detectRust(root);
  return { d, scope: (r: string) => d.scopes.find((s) => s.root === r) };
};

describe('detectRust — D01 estructura Cargo desde TOML válido', () => {
  test('paquete simple: confirmado, un scope en la raíz', async () => {
    await put('Cargo.toml', pkg('app'));
    const { d, scope } = await byRoot();
    expect(d.status).toBe('confirmed');
    expect(scope('.')?.packages).toEqual([{ name: 'app', manifest: 'Cargo.toml' }]);
  });

  test('raíz package+workspace: la raíz y sus miembros son scopes separados', async () => {
    await put('Cargo.toml', `${pkg('root')}\n[workspace]\nmembers = ["crates/*"]\n`);
    await put('crates/a/Cargo.toml', pkg('a'));
    await put('crates/b/Cargo.toml', pkg('b'));
    const { d, scope } = await byRoot();
    expect(d.scopes.map((s) => s.root).sort()).toEqual(['.', 'crates/a', 'crates/b']);
    expect(scope('crates/a')?.packages[0]).toEqual({
      name: 'a',
      manifest: 'crates/a/Cargo.toml',
      workspaceRoot: '.',
    });
  });

  test('workspace virtual: sin scope propio; un paquete excluido no es miembro', async () => {
    await put('Cargo.toml', `[workspace]\nmembers = ["crates/*"]\nexclude = ["crates/skip"]\n`);
    await put('crates/a/Cargo.toml', pkg('a'));
    await put('crates/skip/Cargo.toml', pkg('skip'));
    const { d, scope } = await byRoot();
    expect(d.scopes.map((s) => s.root)).toEqual(['crates/a', 'crates/skip']);
    expect(scope('crates/a')?.packages[0]?.workspaceRoot).toBe('.');
    expect(scope('crates/skip')?.packages[0]?.workspaceRoot).toBeUndefined();
  });

  test('detectProject expone cargo y scopes sin perder campos legacy', async () => {
    await put('Cargo.toml', pkg('app'));
    const p = await detectProject(root);
    expect(p.packageManagers).toContain('cargo');
    expect(p.languages).toContain('rust');
    expect(p.runtimes).toContain('rust');
    expect(p.frameworks).toContain('backend');
    expect(p.scopes?.[0]?.root).toBe('.');
  });
});

describe('detectRust — D02 sin inferencia por substring', () => {
  test('Cargo.toml inválido: inconcluso con error de parseo, no ausente', async () => {
    await put('Cargo.toml', '[package\nname = ');
    const { d } = await byRoot();
    expect(d.status).toBe('inconclusive');
    expect(d.diagnostics.map((x) => x.code)).toContain('toml_parse_error');
  });

  test('"[workspace]" y "sqlx" en comentarios o strings no crean workspace ni dependencia', async () => {
    await put(
      'Cargo.toml',
      `# [workspace]\n${pkg('app', 'description = "uses sqlx and [workspace]"\n')}\n# sqlx = "0.8"\n`,
    );
    const { scope } = await byRoot();
    expect(scope('.')?.packages[0]?.workspaceRoot).toBeUndefined();
    expect(scope('.')?.capabilities).not.toContain('sqlx');
    expect(scope('.')?.dependencyEvidence).toEqual([]);
  });

  test('.rs sin manifest: indicio, no paquete confirmado', async () => {
    await put('src/main.rs', 'fn main() {}');
    const { d } = await byRoot();
    expect(d.status).toBe('indicative');
    expect(d.scopes[0]?.packages).toEqual([]);
  });
});

describe('detectRust — D03 alias y herencia', () => {
  test('alias por `package` conserva nombre real, alias, features y backend', async () => {
    await put(
      'Cargo.toml',
      `${pkg('svc')}\n[dependencies]\ndb = { package = "sqlx", version = "0.8", features = ["postgres"] }\n`,
    );
    const s = (await byRoot()).scope('.');
    expect(s?.dependencyEvidence[0]).toMatchObject({
      file: 'Cargo.toml',
      section: 'dependencies',
      key: 'db',
      name: 'sqlx',
      alias: 'db',
      category: 'normal',
      features: ['postgres'],
      owner: 'svc',
      resolution: 'declared',
    });
    expect(s?.capabilities).toContain('sqlx');
    expect(s?.declaredDatabaseBackends).toEqual(['postgres']);
  });

  test('`workspace = true` hereda del workspace propietario y suma features del miembro', async () => {
    await put(
      'Cargo.toml',
      `[workspace]\nmembers = ["m"]\n[workspace.dependencies]\nsqlx = { version = "0.8", default-features = false, features = ["postgres"] }\n`,
    );
    await put('m/Cargo.toml', `${pkg('m')}\n[dependencies]\nsqlx = { workspace = true, features = ["uuid"] }\n`);
    const ev = (await byRoot()).scope('m')?.dependencyEvidence[0];
    expect(ev).toMatchObject({ name: 'sqlx', resolution: 'workspace-inherited', owner: 'm', defaultFeatures: false });
    expect([...(ev?.features ?? [])].sort()).toEqual(['postgres', 'uuid']);
  });
});

describe('detectRust — D04 categorías y condiciones', () => {
  test('dev/build/optional/target conservan categoría y condición', async () => {
    await put(
      'Cargo.toml',
      `${pkg('app')}
[dependencies]
axum = { version = "0.7", optional = true }
[dev-dependencies]
sqlx = { version = "0.8", features = ["sqlite"] }
[build-dependencies]
tonic = "0.12"
[target.'cfg(unix)'.dependencies]
tokio = "1"
`,
    );
    const s = (await byRoot()).scope('.');
    const get = (name: string) => s?.dependencyEvidence.find((e) => e.name === name);
    expect(get('axum')).toMatchObject({ category: 'normal', optional: true });
    expect(get('sqlx')).toMatchObject({ category: 'dev' });
    expect(get('tonic')).toMatchObject({ category: 'build' });
    expect(get('tokio')).toMatchObject({ category: 'normal', target: "cfg(unix)" });
  });

  test('SQLx solo en dev-dependencies no etiqueta producción ni backends', async () => {
    await put('Cargo.toml', `${pkg('app')}\n[dev-dependencies]\nsqlx = { version = "0.8", features = ["postgres"] }\n`);
    const s = (await byRoot()).scope('.');
    expect(s?.capabilities).not.toContain('sqlx');
    expect(s?.capabilities).toContain('dev:sqlx');
    expect(s?.declaredDatabaseBackends).toEqual([]);
  });
});

describe('detectRust — D05 herencia solo donde se declara', () => {
  test('workspace.dependencies no se atribuye a miembros que no las referencian', async () => {
    await put('Cargo.toml', `[workspace]\nmembers = ["m"]\n[workspace.dependencies]\nsqlx = "0.8"\n`);
    await put('m/Cargo.toml', pkg('m'));
    const s = (await byRoot()).scope('m');
    expect(s?.capabilities).not.toContain('sqlx');
    expect(s?.dependencyEvidence).toEqual([]);
  });
});

describe('detectRust — D05b dependencia propia no hereda del workspace', () => {
  test('un miembro que declara su propio sqlx sin `workspace = true` no recibe features del workspace', async () => {
    await put('Cargo.toml', `[workspace]\nmembers = ["m"]\n[workspace.dependencies]\nsqlx = { version = "0.8", features = ["postgres"] }\n`);
    await put('m/Cargo.toml', `${pkg('m')}\n[dependencies]\nsqlx = "0.8"\n`);
    const s = (await byRoot()).scope('m');
    expect(s?.dependencyEvidence[0]).toMatchObject({ resolution: 'declared', features: [] });
    expect(s?.declaredDatabaseBackends).toEqual([]);
  });
});

describe('detectRust — D06 perfiles por ámbito en monorepo', () => {
  test('ejemplo Rust bajo un frontend Node no convierte la raíz en Rust; target/vendor excluidos', async () => {
    await put('package.json', '{"name":"web","dependencies":{"react":"18"}}');
    await put('examples/demo/Cargo.toml', pkg('demo'));
    await put('target/debug/Cargo.toml', pkg('generated'));
    await put('vendor/dep/Cargo.toml', pkg('vendored'));
    const p = await detectProject(root);
    expect(p.scopes?.map((s) => s.root)).toEqual(['examples/demo']);
    expect(p.languages).not.toContain('rust');
    expect(p.runtimes).not.toContain('rust');
    expect(p.packageManagers).not.toContain('cargo');
  });

  test('repositorio anidado ajeno (.git propio) no se descubre', async () => {
    await put('Cargo.toml', pkg('outer'));
    await put('third_party/x/.git/HEAD', 'ref');
    await put('third_party/x/Cargo.toml', pkg('foreign'));
    expect((await detectRust(root)).scopes.map((s) => s.root)).toEqual(['.']);
  });

  test('si el límite de descubrimiento corta la búsqueda se emite discovery_incomplete', async () => {
    await put('a/b/c/d/e/f/g/h/Cargo.toml', pkg('deep'));
    const d = await detectRust(root);
    expect(d.diagnostics.map((x) => x.code)).toContain('discovery_incomplete');
  });
});

describe('detectRust — D07 independencia de cargo y de rutas externas', () => {
  test('sin cargo en PATH la detección estática funciona', async () => {
    await put('Cargo.toml', pkg('app'));
    const saved = process.env.PATH;
    process.env.PATH = '';
    try {
      expect((await detectRust(root)).status).toBe('confirmed');
    } finally {
      process.env.PATH = saved;
    }
  });

  test('package.workspace fuera de la raíz: pertenencia no resoluble, sin leer fuera', async () => {
    await put('m/Cargo.toml', pkg('m', 'workspace = "../../outside"\n'));
    const { d, scope } = await byRoot();
    expect(d.diagnostics.map((x) => x.code)).toContain('workspace_outside_root');
    expect(scope('m')?.packages[0]?.workspaceRoot).toBeUndefined();
  });

  test('symlink que escapa de la raíz no se sigue', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'cc-rust-out-'));
    try {
      await writeFile(join(outside, 'Cargo.toml'), pkg('escaped'));
      await symlink(outside, join(root, 'link'));
      expect((await detectRust(root)).scopes).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('detectProject — señales Cargo derivadas del TOML parseado', () => {
  test('workspace virtual en la raíz: cargo y señal de monorepo', async () => {
    await put('Cargo.toml', `[workspace]\nmembers = ["crates/*"]\n`);
    await put('crates/a/Cargo.toml', pkg('a'));
    const p = await detectProject(root);
    expect(p.packageManagers).toContain('cargo');
    expect(p.signals).toContain('Cargo.toml-workspace');
  });

  test('"[workspace]" en un comentario no genera la señal de monorepo', async () => {
    await put('Cargo.toml', `# [workspace]\n${pkg('app', 'description = "see [workspace] docs"\n')}`);
    const p = await detectProject(root);
    expect(p.signals).not.toContain('Cargo.toml-workspace');
  });

  test('detect --json expone los scopes sin quitar campos legacy', async () => {
    await put('Cargo.toml', pkg('app'));
    const { detectCommand } = await import('../../../../src/commands/detect.command');
    const out = await detectCommand({ output: 'json' as never, projectRoot: root });
    const detected = (out.data as { detected: { scopes?: Array<{ root: string }>; languages: string[] } }).detected;
    expect(detected.languages).toContain('rust');
    expect(detected.scopes?.[0]?.root).toBe('.');
  });
});
