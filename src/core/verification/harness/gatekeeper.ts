import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { Violation } from './types';

export interface ProductionLimits {
  readonly maxParams: number;
  readonly maxLines: number;
  readonly maxComplexity: number;
}

const DEFAULT_LIMITS: ProductionLimits = { maxParams: 4, maxLines: 250, maxComplexity: 10 };

async function parse(file: string): Promise<ts.SourceFile> {
  const text = await readFile(file, 'utf-8');
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

export async function checkProductionFiles(
  files: readonly string[],
  limits: Partial<ProductionLimits> = {},
): Promise<Violation[]> {
  const max = { ...DEFAULT_LIMITS, ...limits };
  const violations: Violation[] = [];
  for (const file of files) {
    const sf = await parse(file);
    const lines = lineCount(sf.text);
    if (lines > max.maxLines) {
      violations.push({ file, line: 1, rule: 'max-lines', message: `${lines} lines (max ${max.maxLines})` });
    }
    const visit = (node: ts.Node): void => {
      if (isFunctionLike(node)) {
        const params = countParams(node);
        if (params > max.maxParams) {
          violations.push({
            file,
            line: lineOf(sf, node),
            rule: 'max-params',
            message: `${params} parameters (max ${max.maxParams})`,
          });
        }
        const complexity = complexityOf(node);
        if (complexity > max.maxComplexity) {
          violations.push({
            file,
            line: lineOf(sf, node),
            rule: 'max-complexity',
            message: `cyclomatic complexity ${complexity} (max ${max.maxComplexity})`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
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
