import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { ProjectScopeProfile } from '../../../validation/scoped-context-schemas';

type Diagnostic = { readonly code: string; readonly message: string };
type Evidence = ProjectScopeProfile['dependencyEvidence'][number];
type Table = Record<string, unknown>;

export interface RustDetection {
  readonly status: 'confirmed' | 'indicative' | 'inconclusive' | 'absent';
  readonly scopes: readonly ProjectScopeProfile[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Discovery limits; hitting one emits `discovery_incomplete`. */
const MAX_DEPTH = 6;
const MAX_DIRS = 5000;
const SKIPPED_DIRS = new Set(['.git', 'node_modules', 'target', 'vendor', 'dist', 'build', '.codeconductor']);
/** Technologies recorded as evidence; other dependencies are not enumerated. */
const TRACKED = new Set(['tokio', 'async-std', 'axum', 'actix-web', 'tonic', 'tauri', 'diesel', 'sea-orm', 'sqlx']);
const SQL_BACKENDS = new Set(['postgres', 'mysql', 'sqlite']);
const SECTIONS: ReadonlyArray<readonly [string, string, Evidence['category']]> = [
  ['dependencies', 'dependencies', 'normal'],
  ['dev-dependencies', 'dev-dependencies', 'dev'],
  ['dev_dependencies', 'dev-dependencies', 'dev'],
  ['build-dependencies', 'build-dependencies', 'build'],
  ['build_dependencies', 'build-dependencies', 'build'],
];

const isTable = (v: unknown): v is Table => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

interface Manifest {
  readonly path: string;
  readonly doc: Table;
}

async function discover(rootDir: string): Promise<{ manifests: string[]; hasRs: boolean; incomplete: boolean }> {
  const manifests: string[] = [];
  let hasRs = false;
  let incomplete = false;
  let scanned = 0;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: '', depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (++scanned > MAX_DIRS) {
      incomplete = true;
      break;
    }
    let entries;
    try {
      entries = await readdir(join(rootDir, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    // A nested repository is someone else's project, not part of this scope.
    if (dir !== '' && entries.some((e) => e.name === '.git')) continue;
    // Symlinks are neither files nor directories for Dirent, so they are never followed.
    for (const entry of entries) {
      const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isFile()) {
        if (entry.name === 'Cargo.toml') manifests.push(rel);
        else if (entry.name.endsWith('.rs')) hasRs = true;
      } else if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
        if (depth + 1 > MAX_DEPTH) incomplete = true;
        else queue.push({ dir: rel, depth: depth + 1 });
      }
    }
  }
  return { manifests, hasRs, incomplete };
}

/** Resolves `members`/`exclude` entries (exact dir or trailing `/*`) against discovered manifest dirs. */
function matchMembers(wsDir: string, patterns: string[], dirs: ReadonlySet<string>, out: Diagnostic[]): Set<string> {
  const matched = new Set<string>();
  for (const pattern of patterns) {
    const base = pattern.replace(/\/\*$/, '');
    const target = posix.normalize(posix.join(wsDir, base));
    if (/[*?[\]{}]/.test(base)) {
      out.push({ code: 'unsupported_member_glob', message: `Workspace member pattern "${pattern}" is not resolved` });
    } else if (pattern.endsWith('/*')) {
      for (const d of dirs) if (posix.dirname(d) === target) matched.add(d);
    } else if (dirs.has(target)) {
      matched.add(target);
    }
  }
  return matched;
}

function evidenceFrom(
  m: Manifest,
  owner: string,
  wsDeps: Table,
  section: string,
  category: Evidence['category'],
  deps: Table,
  target?: string,
): Evidence[] {
  const out: Evidence[] = [];
  for (const [key, raw] of Object.entries(deps)) {
    const spec: Table = isTable(raw) ? raw : { version: raw };
    const inherited = spec.workspace === true;
    const ws = inherited ? wsDeps[key] : undefined;
    const wsSpec: Table = isTable(ws) ? ws : {};
    const name = String(spec.package ?? wsSpec.package ?? key);
    if (!TRACKED.has(name)) continue;
    const defaultFeatures =
      spec['default-features'] ?? spec.default_features ?? wsSpec['default-features'] ?? wsSpec.default_features;
    out.push({
      file: m.path,
      section,
      key,
      name,
      ...(name !== key ? { alias: key } : {}),
      category,
      optional: spec.optional === true,
      features: [...new Set([...strings(wsSpec.features), ...strings(spec.features)])],
      defaultFeatures: defaultFeatures !== false,
      ...(target !== undefined ? { target } : {}),
      owner,
      resolution: !inherited ? 'declared' : isTable(ws) ? 'workspace-inherited' : 'unresolved',
    });
  }
  return out;
}

function collectEvidence(m: Manifest, owner: string, wsDeps: Table): Evidence[] {
  const out: Evidence[] = [];
  const scan = (block: Table, target?: string): void => {
    for (const [sectionKey, section, category] of SECTIONS) {
      const deps = block[sectionKey];
      if (isTable(deps)) out.push(...evidenceFrom(m, owner, wsDeps, section, category, deps, target));
    }
  };
  scan(m.doc);
  if (isTable(m.doc.target)) {
    for (const [cfg, block] of Object.entries(m.doc.target)) if (isTable(block)) scan(block, cfg);
  }
  return out;
}

function profileOf(
  root: string,
  status: ProjectScopeProfile['status'],
  packages: ProjectScopeProfile['packages'],
  evidence: Evidence[],
  diagnostics: Diagnostic[],
): ProjectScopeProfile {
  const capabilities = new Set<string>();
  const backends = new Set<string>();
  for (const e of evidence) {
    capabilities.add(e.category === 'normal' ? e.name : `${e.category}:${e.name}`);
    if (e.category === 'normal' && e.name === 'sqlx') for (const f of e.features) if (SQL_BACKENDS.has(f)) backends.add(f);
  }
  return {
    root,
    language: 'rust',
    status,
    packages,
    capabilities: [...capabilities].sort(),
    declaredDatabaseBackends: [...backends].sort(),
    dependencyEvidence: evidence,
    diagnostics,
  };
}

/** Detects Rust packages from parsed Cargo manifests. Never executes cargo and never reads outside `rootDir`. */
export async function detectRust(rootDir: string): Promise<RustDetection> {
  const found = await discover(rootDir);
  const discoveryDiagnostics: Diagnostic[] = found.incomplete
    ? [{ code: 'discovery_incomplete', message: `Rust discovery stopped at depth ${MAX_DEPTH} / ${MAX_DIRS} directories` }]
    : [];
  const manifests = new Map<string, Manifest>();
  const scopes: ProjectScopeProfile[] = [];

  for (const path of found.manifests.sort()) {
    const dir = posix.dirname(path);
    try {
      manifests.set(dir, { path, doc: parseToml(await readFile(join(rootDir, path), 'utf-8')) as Table });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      scopes.push(profileOf(dir, 'inconclusive', [], [], [{ code: 'toml_parse_error', message }]));
    }
  }

  const dirs = new Set(manifests.keys());
  const memberOf = new Map<string, string>();
  const wsDiagnostics = new Map<string, Diagnostic[]>();
  for (const [wsDir, m] of manifests) {
    if (!isTable(m.doc.workspace)) continue;
    const local: Diagnostic[] = [];
    const members = matchMembers(wsDir, strings(m.doc.workspace.members), dirs, local);
    for (const excluded of matchMembers(wsDir, strings(m.doc.workspace.exclude), dirs, local)) members.delete(excluded);
    for (const member of members) if (member !== wsDir) memberOf.set(member, wsDir);
    wsDiagnostics.set(wsDir, local);
  }

  for (const [dir, m] of manifests) {
    const pkgTable = isTable(m.doc.package) ? m.doc.package : undefined;
    const local: Diagnostic[] = [...(wsDiagnostics.get(dir) ?? [])];
    let workspaceRoot = isTable(m.doc.workspace) ? dir : memberOf.get(dir);
    if (typeof pkgTable?.workspace === 'string') {
      const explicit = posix.normalize(posix.join(dir, pkgTable.workspace));
      if (explicit.startsWith('..') || posix.isAbsolute(explicit)) {
        local.push({ code: 'workspace_outside_root', message: `package.workspace "${pkgTable.workspace}" leaves the authorized root` });
        workspaceRoot = undefined;
      } else if (manifests.has(explicit)) {
        workspaceRoot = explicit;
      }
    }
    if (!pkgTable) {
      if (!isTable(m.doc.workspace)) {
        local.push({ code: 'manifest_without_package_or_workspace', message: `${m.path} declares neither [package] nor [workspace]` });
        scopes.push(profileOf(dir, 'inconclusive', [], [], local));
      } else if (![...memberOf.values()].includes(dir)) {
        local.push({ code: 'workspace_without_members', message: `${m.path} is a virtual workspace with no resolved members` });
        scopes.push(profileOf(dir, 'confirmed', [], [], local));
      }
      continue;
    }
    const name = String(pkgTable.name ?? posix.basename(dir));
    const wsRaw = workspaceRoot !== undefined ? manifests.get(workspaceRoot)?.doc.workspace : undefined;
    const wsDeps = isTable(wsRaw) && isTable(wsRaw.dependencies) ? wsRaw.dependencies : {};
    const pkg = { name, manifest: m.path, ...(workspaceRoot !== undefined ? { workspaceRoot } : {}) };
    scopes.push(profileOf(dir, 'confirmed', [pkg], collectEvidence(m, name, wsDeps), local));
  }

  if (scopes.length === 0 && found.hasRs) scopes.push(profileOf('.', 'indicative', [], [], []));
  const finalScopes = scopes
    .map((s) => ({ ...s, diagnostics: [...s.diagnostics, ...discoveryDiagnostics] }))
    .sort((a, b) => (a.root < b.root ? -1 : a.root > b.root ? 1 : 0));

  const has = (status: ProjectScopeProfile['status']): boolean => finalScopes.some((s) => s.status === status);
  const status = has('confirmed') ? 'confirmed' : has('inconclusive') ? 'inconclusive' : has('indicative') ? 'indicative' : 'absent';
  const scopeDiagnostics = scopes.flatMap((s) => s.diagnostics);
  return { status, scopes: finalScopes, diagnostics: [...discoveryDiagnostics, ...scopeDiagnostics] };
}
