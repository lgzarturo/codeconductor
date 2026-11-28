import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { Violation } from './types';

export interface ProductionLimits {
  readonly maxParams: number;
  readonly maxLines: number;
  readonly maxComplexity: number;
}

/** Structural metrics for one function-like declaration (declaration order). */
export interface FunctionMetrics {
  readonly name: string;
  readonly line: number;
  readonly params: number;
  readonly complexity: number;
}

export interface FileMetrics {
  readonly lines: number;
  readonly functions: readonly FunctionMetrics[];
}

/**
 * `absolute` — enforce DEFAULT_LIMITS / overrides as hard ceilings.
 * `regression` — for symbols present in `baseline`, only fail when metrics worsen;
 * new symbols and files without baseline still use absolute ceilings.
 */
export type ProductionCheckMode = 'absolute' | 'regression';

export interface ProductionCheckOptions {
  readonly mode?: ProductionCheckMode;
  /** Keyed by the same absolute paths passed in `files`. */
  readonly baseline?: ReadonlyMap<string, FileMetrics>;
}

const DEFAULT_LIMITS: ProductionLimits = { maxParams: 4, maxLines: 250, maxComplexity: 10 };

async function parse(file: string): Promise<ts.SourceFile> {
  const text = await readFile(file, 'utf-8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function parseText(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function functionName(fn: ts.FunctionLikeDeclaration): string {
  if (fn.name && (ts.isIdentifier(fn.name) || ts.isPrivateIdentifier(fn.name))) {
    return fn.name.text;
  }
  if (ts.isConstructorDeclaration(fn)) return 'constructor';
  const parent = fn.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (
    (ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
    parent.name &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }
  return '<anonymous>';
}

function isDecision(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    return (
      k === ts.SyntaxKind.AmpersandAmpersandToken ||
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.QuestionQuestionToken ||
      k === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
      k === ts.SyntaxKind.BarBarEqualsToken ||
      k === ts.SyntaxKind.QuestionQuestionEqualsToken
    );
  }
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node)
  );
}

/** Cyclomatic complexity of one function; nested functions are measured on their own. */
function complexityOf(fn: ts.FunctionLikeDeclaration): number {
  let total = 1;
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) return;
    if (isDecision(node)) total++;
    ts.forEachChild(node, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  for (const p of fn.parameters) if (p.initializer) visit(p.initializer);
  return total;
}

function countParams(fn: ts.FunctionLikeDeclaration): number {
  return fn.parameters.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === 'this')).length;
}

function lineCount(text: string): number {
  const lines = text.split(/\r?\n/);
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

function metricsFromSourceFile(sf: ts.SourceFile): FileMetrics {
  const functions: FunctionMetrics[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      functions.push({
        name: functionName(node),
        line: lineOf(sf, node),
        params: countParams(node),
        complexity: complexityOf(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { lines: lineCount(sf.text), functions };
}

export function collectProductionMetricsFromText(file: string, text: string): FileMetrics {
  return metricsFromSourceFile(parseText(file, text));
}

export async function collectProductionMetrics(
  files: readonly string[],
): Promise<Map<string, FileMetrics>> {
  const out = new Map<string, FileMetrics>();
  for (const file of files) {
    out.set(file, metricsFromSourceFile(await parse(file)));
  }
  return out;
}

function baselineFnQueue(
  baseline: FileMetrics | undefined,
): Map<string, FunctionMetrics[]> {
  const queue = new Map<string, FunctionMetrics[]>();
  if (!baseline) return queue;
  for (const fn of baseline.functions) {
    const list = queue.get(fn.name) ?? [];
    list.push(fn);
    queue.set(fn.name, list);
  }
  return queue;
}

function takeBaselineFn(
  queue: Map<string, FunctionMetrics[]>,
  name: string,
): FunctionMetrics | undefined {
  const list = queue.get(name);
  if (!list || list.length === 0) return undefined;
  return list.shift();
}

function checkFileMetrics(
  file: string,
  current: FileMetrics,
  max: ProductionLimits,
  mode: ProductionCheckMode,
  baseline: FileMetrics | undefined,
): Violation[] {
  const violations: Violation[] = [];
  const regression = mode === 'regression' && baseline !== undefined;

  if (regression) {
    if (current.lines > baseline.lines) {
      violations.push({
        file,
        line: 1,
        rule: 'max-lines',
        message: `${current.lines} lines (was ${baseline.lines}; regression)`,
      });
    }
  } else if (current.lines > max.maxLines) {
    violations.push({
      file,
      line: 1,
      rule: 'max-lines',
      message: `${current.lines} lines (max ${max.maxLines})`,
    });
  }

  const queue = baselineFnQueue(baseline);
  for (const fn of current.functions) {
    const prior = regression ? takeBaselineFn(queue, fn.name) : undefined;
    if (prior) {
      if (fn.params > prior.params) {
        violations.push({
          file,
          line: fn.line,
          rule: 'max-params',
          message: `${fn.params} parameters (was ${prior.params}; regression)`,
        });
      }
      if (fn.complexity > prior.complexity) {
        violations.push({
          file,
          line: fn.line,
          rule: 'max-complexity',
          message: `cyclomatic complexity ${fn.complexity} (was ${prior.complexity}; regression)`,
        });
      }
      continue;
    }
    if (fn.params > max.maxParams) {
      violations.push({
        file,
        line: fn.line,
        rule: 'max-params',
        message: `${fn.params} parameters (max ${max.maxParams})`,
      });
    }
    if (fn.complexity > max.maxComplexity) {
      violations.push({
        file,
        line: fn.line,
        rule: 'max-complexity',
        message: `cyclomatic complexity ${fn.complexity} (max ${max.maxComplexity})`,
      });
    }
  }
  return violations;
}

export async function checkProductionFiles(
  files: readonly string[],
  limits: Partial<ProductionLimits> = {},
  options: ProductionCheckOptions = {},
): Promise<Violation[]> {
  const max = { ...DEFAULT_LIMITS, ...limits };
  const mode = options.mode ?? 'absolute';
  const violations: Violation[] = [];
  for (const file of files) {
    const current = metricsFromSourceFile(await parse(file));
    violations.push(...checkFileMetrics(file, current, max, mode, options.baseline?.get(file)));
  }
  return violations;
}

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('**')
    .map((part) => part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

// Matched on the member name, so `import { mock as m }` aliases are caught too.
const MOCK_MODULE_MEMBERS = new Set(['module', 'mock', 'doMock', 'unstable_mockModule']);

export async function checkTestFiles(
  files: readonly string[],
  domainGlobs: readonly string[],
  root: string,
): Promise<Violation[]> {
  const matchers = domainGlobs.map(globToRegExp);
  const isDomain = (file: string, specifier: string): boolean => {
    if (!specifier.startsWith('.')) return false;
    const rel = relative(root, resolve(dirname(file), specifier)).replace(/\\/g, '/');
    // A specifier has no extension, so also try the file and index forms.
    return [rel, `${rel}.ts`, `${rel}/index.ts`].some((c) => matchers.some((m) => m.test(c)));
  };

  const violations: Violation[] = [];
  for (const file of files) {
    const sf = await parse(file);
    const domainNames = new Set<string>();
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      if (!isDomain(file, stmt.moduleSpecifier.text)) continue;
      const clause = stmt.importClause;
      if (clause?.name) domainNames.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) domainNames.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach((e) => domainNames.add(e.name.text));
    }

    // `const s = new Svc()` makes `s` a domain object as well.
    const bind = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isNewExpression(node.initializer) &&
        domainNames.has(node.initializer.expression.getText(sf))
      ) {
        domainNames.add(node.name.text);
      }
      ts.forEachChild(node, bind);
    };
    bind(sf);

    const flag = (node: ts.Node, message: string): void => {
      violations.push({ file, line: lineOf(sf, node), rule: 'no-internal-mock', message });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const first = node.arguments[0];
        if (ts.isPropertyAccessExpression(callee)) {
          const target = first && ts.isStringLiteralLike(first) ? first.text : undefined;
          if (MOCK_MODULE_MEMBERS.has(callee.name.text) && target !== undefined && isDomain(file, target)) {
            flag(node, `${callee.getText(sf)} on domain module ${target}`);
          }
        }
        const calleeName = ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText(sf);
        const spied = first && ts.isPropertyAccessExpression(first) && first.name.text === 'prototype' ? first.expression : first;
        if (calleeName === 'spyOn' && spied && ts.isIdentifier(spied) && domainNames.has(spied.text)) {
          flag(node, `spyOn on domain import ${spied.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return violations;
}

function isExpectCall(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'expect';
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'expect' &&
    (callee.name.text === 'soft' || callee.name.text === 'poll')
  );
}

/** `expect(x)` alone asserts nothing; it only counts when a matcher is invoked on it. */
function hasMatcher(expectCall: ts.CallExpression): boolean {
  let node: ts.Node = expectCall;
  const isWrapper = (p: ts.Node): boolean =>
    (ts.isPropertyAccessExpression(p) && p.expression === node) ||
    ts.isParenthesizedExpression(p) ||
    ts.isAsExpression(p) ||
    ts.isNonNullExpression(p);
  while (node.parent && isWrapper(node.parent)) {
    node = node.parent;
  }
  return node !== expectCall && !!node.parent && ts.isCallExpression(node.parent) && node.parent.expression === node;
}

export async function countAssertions(file: string): Promise<number> {
  const sf = await parse(file);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isExpectCall(node) && hasMatcher(node)) {
      count++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return count;
}
