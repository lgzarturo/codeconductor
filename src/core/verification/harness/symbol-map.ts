import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { writeContainedFile } from '../../filesystem/path-containment';
import { runGit } from './git';
import type { Collision } from './types';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'test', 'tests', '.worktrees']);
const MIN_FUNCTION_NAME_LENGTH = 13;

export interface SymbolEntry {
  readonly name: string;
  readonly kind: 'class' | 'function' | 'interface' | 'type' | 'enum' | 'const';
  readonly signature: string;
  readonly members?: readonly string[];
}

export interface ModuleContract {
  readonly sha256: string;
  readonly symbols: readonly SymbolEntry[];
}

export interface SymbolMap {
  readonly baseCommitSha: string;
  readonly modules: Record<string, ModuleContract>;
}

export interface BuildResult {
  readonly map: SymbolMap;
  readonly parsed: number;
  readonly reused: number;
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function callSignature(fn: ts.SignatureDeclarationBase, sf: ts.SourceFile): string {
  const params = fn.parameters.map((p) => p.getText(sf)).join(', ');
  return `(${params})${fn.type ? `: ${fn.type.getText(sf)}` : ''}`;
}

function isPrivate(member: ts.ClassElement): boolean {
  const flags = ts.getCombinedModifierFlags(member as ts.Declaration);
  return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0 || (!!member.name && ts.isPrivateIdentifier(member.name));
}

function classMembers(node: ts.ClassDeclaration, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const m of node.members) {
    if (isPrivate(m) || !m.name) continue;
    if (ts.isMethodDeclaration(m)) out.push(`${m.name.getText(sf)}${callSignature(m, sf)}`);
    else if (ts.isPropertyDeclaration(m)) out.push(`${m.name.getText(sf)}${m.type ? `: ${m.type.getText(sf)}` : ''}`);
  }
  return out;
}

function interfaceMembers(node: ts.InterfaceDeclaration, sf: ts.SourceFile): string[] {
  return node.members.map((m) => m.getText(sf).replace(/[;,]\s*$/, ''));
}

function extractSymbols(sf: ts.SourceFile): SymbolEntry[] {
  const out: SymbolEntry[] = [];
  for (const node of sf.statements) {
    if (!isExported(node)) continue;
    if (ts.isClassDeclaration(node) && node.name) {
      const heritage = node.heritageClauses?.map((h) => h.getText(sf)).join(' ') ?? '';
      out.push({
        name: node.name.text,
        kind: 'class',
        signature: `class ${node.name.text}${heritage ? ` ${heritage}` : ''}`,
        members: classMembers(node, sf),
      });
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      out.push({ name: node.name.text, kind: 'function', signature: callSignature(node, sf) });
    } else if (ts.isInterfaceDeclaration(node)) {
      out.push({
        name: node.name.text,
        kind: 'interface',
        signature: `interface ${node.name.text}`,
        members: interfaceMembers(node, sf),
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      out.push({ name: node.name.text, kind: 'type', signature: node.type.getText(sf) });
    } else if (ts.isEnumDeclaration(node)) {
      out.push({ name: node.name.text, kind: 'enum', signature: `enum ${node.name.text}` });
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          out.push({ name: d.name.text, kind: 'const', signature: d.type ? d.type.getText(sf) : '' });
        }
      }
    }
  }
  return out;
}

function isSourceFile(name: string): boolean {
  return name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.endsWith('.test.ts');
}

async function listSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(join(dir, entry.name));
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(join(dir, entry.name));
      }
    }
  };
  await walk(root);
  return files.sort();
}

async function readExistingMap(path: string): Promise<SymbolMap | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as SymbolMap;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function headSha(root: string): Promise<string> {
  return ((await runGit(root, ['rev-parse', 'HEAD'])) ?? 'untracked').trim();
}

export async function buildSymbolMap(root: string, outPath: string): Promise<BuildResult> {
  const cached = (await readExistingMap(outPath))?.modules ?? {};
  const modules: Record<string, ModuleContract> = {};
  let parsed = 0;
  let reused = 0;
  for (const file of await listSourceFiles(root)) {
    const key = relative(root, file).replace(/\\/g, '/');
    const text = await readFile(file, 'utf-8');
    const sha256 = createHash('sha256').update(text).digest('hex');
    const hit = cached[key];
    if (hit && hit.sha256 === sha256) {
      modules[key] = hit;
      reused++;
      continue;
    }
    const symbols = extractSymbols(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    parsed++;
    if (symbols.length > 0) modules[key] = { sha256, symbols };
  }
  const map: SymbolMap = { baseCommitSha: await headSha(root), modules };
  await writeContainedFile(root, relative(root, outPath), JSON.stringify(map, null, 2), { force: true });
  return { map, parsed, reused };
}

function isTracked(symbol: SymbolEntry): boolean {
  const generic = symbol.kind === 'function' || symbol.kind === 'const';
  return !generic || symbol.name.length >= MIN_FUNCTION_NAME_LENGTH;
}

export async function findCollisions(
  mapPath: string,
  stubFiles: readonly string[],
  root: string,
): Promise<Collision[]> {
  const map = await readExistingMap(mapPath);
  if (!map) return [];
  const registry = new Map<string, string[]>();
  for (const [file, mod] of Object.entries(map.modules)) {
    for (const symbol of mod.symbols) {
      if (isTracked(symbol)) registry.set(symbol.name, [...(registry.get(symbol.name) ?? []), file]);
    }
  }
  const collisions: Collision[] = [];
  for (const stub of stubFiles) {
    const stubFile = relative(root, stub).replace(/\\/g, '/');
    const sf = ts.createSourceFile(stub, await readFile(stub, 'utf-8'), ts.ScriptTarget.Latest, true);
    for (const symbol of extractSymbols(sf)) {
      const existingFile = registry.get(symbol.name)?.find((f) => f !== stubFile);
      if (isTracked(symbol) && existingFile !== undefined) {
        collisions.push({ name: symbol.name, stubFile, existingFile });
      }
    }
  }
  return collisions;
}
