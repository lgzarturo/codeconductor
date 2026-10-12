import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { readFileWithinRoot } from '../filesystem/path-containment';
import {
  ScopedRuleFileSchema,
  type ContextManifest,
  type ScopedContext,
  type ScopedRule,
} from '../../validation/scoped-context-schemas';
import { assembleContext } from './context-assembly';

export type OriginClass = 'engine' | 'stack' | 'repository' | 'task';

export interface RuleSource {
  readonly originClass: OriginClass;
  readonly sourcePath: string;
  readonly contentHash: string;
  readonly rules: readonly ScopedRule[];
}

export interface RuleDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'blocking';
  readonly message: string;
}

export interface EffectiveRule {
  readonly rule: ScopedRule;
  readonly originClass: OriginClass;
  readonly depth: number;
  readonly provenance: readonly { readonly sourcePath: string; readonly contentHash: string }[];
  readonly appliesTo: readonly string[];
}

export interface Resolution {
  readonly effective: readonly EffectiveRule[];
  readonly overrides: readonly { readonly id: string; readonly winner: string; readonly loser: string }[];
  readonly diagnostics: readonly RuleDiagnostic[];
  readonly blocked: boolean;
}

/** Authority order for same-id defaults; the registry assigns it, a rule cannot raise itself. */
const CLASS_RANK: Record<OriginClass, number> = { engine: 0, stack: 1, repository: 2, task: 3 };
export const RULES_DIR = '.codeconductor/rules';

/** Contained read; missing paths throw ENOENT upstream, so both cases map to undefined. */
async function readContained(projectRoot: string, relPath: string): Promise<string | undefined> {
  try {
    return await readFileWithinRoot(projectRoot, relPath);
  } catch {
    return undefined;
  }
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** JSON with sorted keys: equal values serialize equally regardless of insertion order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => byText(a, b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** POSIX-normalized path inside the root, or undefined when it escapes (absolute, drive, `..`). */
function normalizeScopePath(file: string): string | undefined {
  const unified = file.replace(/\\/g, '/');
  if (unified === '' || unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) return undefined;
  const normalized = posix.normalize(unified);
  return normalized === '..' || normalized.startsWith('../') ? undefined : normalized;
}

const normalizeRoot = (root: string): string => (root === '.' ? '.' : posix.normalize(root).replace(/\/$/, ''));
const depthOf = (root: string): number => (root === '.' ? 0 : root.split('/').length);

function relativeTo(root: string, file: string): string | undefined {
  if (root === '.') return file;
  return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : undefined;
}

function applies(rule: ScopedRule, file: string, role: string, languages: readonly string[]): boolean {
  const rel = relativeTo(normalizeRoot(rule.scopeRoot), file);
  if (rel === undefined) return false;
  if (rule.when.roles && !rule.when.roles.includes(role)) return false;
  if (rule.when.languages && !rule.when.languages.some((l) => languages.includes(l))) return false;
  const { files, subtrees } = rule.paths;
  if (files.length === 0 && subtrees.length === 0) return true;
  return (
    files.some((f) => posix.normalize(f) === rel) ||
    subtrees.some((s) => {
      const sub = posix.normalize(s).replace(/\/$/, '');
      return rel === sub || rel.startsWith(`${sub}/`);
    })
  );
}

interface Candidate {
  readonly rule: ScopedRule;
  readonly source: RuleSource;
  readonly depth: number;
  readonly canonical: string;
}

/**
 * Resolves, per file, which rules govern it. Same-id defaults are ordered by
 * (origin class, scopeRoot depth); path filters only decide applicability.
 */
export function resolveScopedRules(input: {
  readonly files: readonly string[];
  readonly role: string;
  readonly sources: readonly RuleSource[];
  readonly languagesOf?: (file: string) => readonly string[];
}): Resolution {
  const diagnostics = new Map<string, RuleDiagnostic>();
  const diagnose = (code: string, severity: RuleDiagnostic['severity'], message: string): void => {
    diagnostics.set(`${code}\0${message}`, { code, severity, message });
  };

  const files: string[] = [];
  for (const file of input.files) {
    const normalized = normalizeScopePath(file);
    if (normalized === undefined) diagnose('path_escape', 'blocking', `Path "${file}" escapes the authorized root`);
    else files.push(normalized);
  }

  const candidates: Candidate[] = input.sources.flatMap((source) =>
    source.rules.map((rule) => ({
      rule,
      source,
      depth: depthOf(normalizeRoot(rule.scopeRoot)),
      canonical: stableStringify(rule),
    })),
  );
  const compare = (a: Candidate, b: Candidate): number =>
    CLASS_RANK[a.source.originClass] - CLASS_RANK[b.source.originClass] || a.depth - b.depth;

  const overrides = new Map<string, { id: string; winner: string; loser: string }>();
  const effective = new Map<string, { candidate: Candidate; provenance: Map<string, string>; appliesTo: Set<string> }>();
  const keep = (candidate: Candidate, file: string): void => {
    const key = `${candidate.rule.id}\0${candidate.source.originClass}\0${candidate.canonical}`;
    const entry = effective.get(key) ?? { candidate, provenance: new Map(), appliesTo: new Set() };
    entry.provenance.set(candidate.source.sourcePath, candidate.source.contentHash);
    entry.appliesTo.add(file);
    effective.set(key, entry);
  };

  for (const file of [...new Set(files)].sort(byText)) {
    const languages = input.languagesOf?.(file) ?? [];
    const applicable = candidates.filter((c) => applies(c.rule, file, input.role, languages));
    const ids = [...new Set(applicable.map((c) => c.rule.id))].sort(byText);
    for (const id of ids) {
      const group = applicable.filter((c) => c.rule.id === id);
      const invariants = group.filter((c) => c.rule.kind === 'invariant');
      const defaults = group.filter((c) => c.rule.kind === 'default');
      for (const invariant of invariants) keep(invariant, file);
      if (defaults.length === 0) continue;
      if (invariants.length > 0) {
        const where = defaults.map((c) => c.source.sourcePath).sort(byText).join(', ');
        diagnose('invariant_overridden', 'blocking', `Default "${id}" from ${where} contradicts an applicable invariant`);
        continue;
      }
      const top = defaults.reduce((best, c) => (compare(c, best) > 0 ? c : best));
      const tied = defaults.filter((c) => compare(c, top) === 0);
      if (new Set(tied.map((c) => c.canonical)).size > 1) {
        const where = tied.map((c) => c.source.sourcePath).sort(byText).join(', ');
        diagnose('rule_conflict', 'blocking', `Rule "${id}" has incompatible definitions at the same priority: ${where}`);
        continue;
      }
      for (const winner of tied) keep(winner, file);
      const winnerPath = tied.map((c) => c.source.sourcePath).sort(byText)[0]!;
      for (const loser of defaults.filter((c) => compare(c, top) !== 0)) {
        overrides.set(`${id}\0${winnerPath}\0${loser.source.sourcePath}`, {
          id,
          winner: winnerPath,
          loser: loser.source.sourcePath,
        });
      }
    }
  }

  const resolved = [...effective.values()]
    .map(({ candidate, provenance, appliesTo }) => ({
      rule: candidate.rule,
      originClass: candidate.source.originClass,
      depth: candidate.depth,
      provenance: [...provenance]
        .map(([sourcePath, contentHash]) => ({ sourcePath, contentHash }))
        .sort((a, b) => byText(a.sourcePath, b.sourcePath)),
      appliesTo: [...appliesTo].sort(byText),
    }))
    .sort((a, b) => byText(a.rule.id, b.rule.id) || byText(stableStringify(a.rule), stableStringify(b.rule)));
  const sortedDiagnostics = [...diagnostics.values()].sort((a, b) => byText(a.code, b.code) || byText(a.message, b.message));
  return {
    effective: resolved,
    overrides: [...overrides.values()].sort((a, b) =>
      byText(`${a.id}\0${a.winner}\0${a.loser}`, `${b.id}\0${b.winner}\0${b.loser}`),
    ),
    diagnostics: sortedDiagnostics,
    blocked: sortedDiagnostics.some((d) => d.severity === 'blocking'),
  };
}

/** Builds the auditable manifest; the hash covers decisions only (no timestamps or temp paths). */
export function buildContextManifest(input: {
  readonly resolution: Resolution;
  readonly files: readonly string[];
  readonly role: string;
  readonly profiles?: readonly unknown[];
  readonly skills?: readonly { readonly id: string; readonly version: string }[];
  readonly omittedReferences?: readonly { readonly ref: string; readonly reason: string }[];
  readonly budget: { readonly maxBytes: number; readonly usedBytes: number };
}): ContextManifest {
  const files = input.files.map(normalizeScopePath).filter((f): f is string => f !== undefined);
  const body = {
    schemaVersion: 1 as const,
    scope: { files: [...new Set(files)].sort(byText), role: input.role },
    profiles: [...(input.profiles ?? [])],
    skills: [...(input.skills ?? [])].sort((a, b) => byText(a.id, b.id)),
    rules: input.resolution.effective
      .flatMap((e) =>
        e.provenance.map((p) => ({
          id: e.rule.id,
          kind: e.rule.kind,
          originClass: e.originClass,
          scopeRoot: e.rule.scopeRoot,
          depth: e.depth,
          sourcePath: p.sourcePath,
          contentHash: p.contentHash,
          appliesTo: [...e.appliesTo],
        })),
      )
      .sort((a, b) => byText(a.id, b.id) || byText(a.sourcePath, b.sourcePath)),
    overrides: [...input.resolution.overrides].sort((x, y) =>
      byText(`${x.id}\0${x.winner}\0${x.loser}`, `${y.id}\0${y.winner}\0${y.loser}`),
    ),
    omittedReferences: [...(input.omittedReferences ?? [])].sort((a, b) => byText(a.ref, b.ref)),
    diagnostics: input.resolution.diagnostics
      .map((d) => ({ ...d }))
      .sort((x, y) => byText(x.code, y.code) || byText(x.message, y.message)),
    budget: { ...input.budget },
  };
  return { ...body, hash: sha256(stableStringify(body)) };
}

async function listRuleFiles(projectRoot: string, dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(projectRoot, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listRuleFiles(projectRoot, rel)));
    else if (/\.ya?ml$/.test(entry.name)) out.push(rel);
  }
  return out.sort(byText);
}

/** Loads `.codeconductor/rules/**` as `repository` sources; unreadable or invalid files are reported, never skipped. */
export async function loadRuleSources(
  projectRoot: string,
): Promise<{ sources: RuleSource[]; diagnostics: RuleDiagnostic[] }> {
  const sources: RuleSource[] = [];
  const diagnostics: RuleDiagnostic[] = [];
  const reject = (code: string, message: string): void => {
    diagnostics.push({ code, severity: 'blocking', message });
  };
  for (const sourcePath of await listRuleFiles(projectRoot, RULES_DIR)) {
    const raw = await readContained(projectRoot, sourcePath);
    if (raw === undefined) {
      reject('rule_source_unreadable', `${sourcePath} is not a readable file inside the project root`);
      continue;
    }
    let parsed;
    try {
      parsed = ScopedRuleFileSchema.safeParse(parseYaml(raw));
    } catch (error) {
      reject('rule_source_invalid', `${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      reject('rule_source_invalid', `${sourcePath}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'invalid'}`.trim());
      continue;
    }
    sources.push({ originClass: 'repository', sourcePath, contentHash: sha256(raw), rules: parsed.data.rules });
  }
  return { sources, diagnostics };
}

/** Optional references that do not resolve to a readable file inside the root; surfaced, not blocking. */
export async function checkReferences(
  projectRoot: string,
  effective: readonly EffectiveRule[],
): Promise<{ ref: string; reason: string }[]> {
  const refs = [...new Set(effective.flatMap((e) => e.rule.references))]
    .filter((r) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(r))
    .sort(byText);
  const missing: { ref: string; reason: string }[] = [];
  for (const ref of refs) {
    if ((await readContained(projectRoot, ref)) === undefined) missing.push({ ref, reason: 'missing' });
  }
  return missing;
}

/** Upper bound for the mandatory rule view; exceeding it blocks instead of dropping rules. */
export const DEFAULT_RULES_BUDGET_BYTES = 16384;

/**
 * Loads, resolves and budgets the rules for a set of files. Returns no context
 * only when the project has no rules at all; every other problem is a blocking diagnostic.
 */
export async function resolveScopedContext(
  projectRoot: string,
  input: {
    readonly files: readonly string[];
    readonly role: string;
    readonly languagesOf?: (file: string) => readonly string[];
    readonly maxBytes?: number;
  },
): Promise<{ scopedContext?: ScopedContext; blocked: boolean; diagnostics: RuleDiagnostic[] }> {
  const loaded = await loadRuleSources(projectRoot);
  if (loaded.sources.length === 0 && loaded.diagnostics.length === 0) return { blocked: false, diagnostics: [] };

  const resolved = resolveScopedRules({ ...input, sources: loaded.sources });
  const rules = resolved.effective.map((e) => ({
    id: e.rule.id,
    kind: e.rule.kind,
    trigger: e.rule.trigger,
    action: e.rule.action,
    exceptions: e.rule.exceptions,
    verify: [...e.rule.verification.recipeIds],
    appliesTo: [...e.appliesTo],
    source: e.provenance[0]!.sourcePath,
  }));
  const maxBytes = input.maxBytes ?? DEFAULT_RULES_BUDGET_BYTES;
  const assembly = assembleContext(
    rules.map((rule) => ({ source: 'rules' as const, id: rule.id, required: true, content: stableStringify(rule) })),
    maxBytes,
  );
  const diagnostics: RuleDiagnostic[] = [
    ...loaded.diagnostics,
    ...resolved.diagnostics,
    ...assembly.blocking.map((b) => ({
      code: b.code,
      severity: 'blocking' as const,
      message: `Required rules (${b.requiredBytes} bytes) exceed the ${b.maxBytes}-byte budget: ${b.elements.join(', ')}`,
    })),
  ];
  const resolution: Resolution = {
    ...resolved,
    diagnostics,
    blocked: diagnostics.some((d) => d.severity === 'blocking'),
  };
  const manifest = buildContextManifest({
    resolution,
    files: input.files,
    role: input.role,
    omittedReferences: await checkReferences(projectRoot, resolved.effective),
    budget: { maxBytes, usedBytes: assembly.contextBytes },
  });
  return {
    scopedContext: { manifest, view: { hash: sha256(stableStringify(rules)), rules } },
    blocked: resolution.blocked,
    diagnostics,
  };
}
