#!/usr/bin/env bun
/**
 * Stdlib-first lint gate for this repo.
 *
 * Rules (src/ TypeScript only):
 * - no `any` type annotations or assertions
 * - no `as unknown as` double casts
 * - no `import` statements nested inside functions
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SRC_ROOT = join(ROOT, 'src');

interface LintIssue {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly excerpt: string;
}

const NESTED_IMPORT = /^\s+import\s/;
const ANY_ASSERTION = /\bas any\b/;
const DOUBLE_CAST = /\bas unknown as\b/;
const ANY_ANNOTATION = /:\s*any\b/;

function isCommentOnly(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/')
  );
}

function lintLine(line: string, inBlockComment: boolean): string | undefined {
  if (inBlockComment || isCommentOnly(line)) return undefined;
  const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
  if (DOUBLE_CAST.test(code)) return 'no-as-unknown-as';
  if (ANY_ASSERTION.test(code) || ANY_ANNOTATION.test(code)) return 'no-any';
  if (NESTED_IMPORT.test(line)) return 'no-nested-import';
  return undefined;
}

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

export async function lintSourceTree(root = SRC_ROOT): Promise<LintIssue[]> {
  const files = await collectTsFiles(root);
  const issues: LintIssue[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    let inBlockComment = false;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const opens = (line.match(/\/\*/g) ?? []).length;
      const closes = (line.match(/\*\//g) ?? []).length;
      const rule = lintLine(line, inBlockComment);
      if (opens > closes) inBlockComment = true;
      if (closes > opens) inBlockComment = false;
      if (!rule) continue;
      issues.push({
        file: relative(ROOT, file),
        line: i + 1,
        rule,
        excerpt: line.trim(),
      });
    }
  }

  return issues;
}

async function main(): Promise<void> {
  const issues = await lintSourceTree();
  if (issues.length === 0) {
    process.stdout.write('lint: ok\n');
    return;
  }
  for (const issue of issues) {
    process.stderr.write(
      `${issue.file}:${issue.line}  ${issue.rule}  ${issue.excerpt}\n`,
    );
  }
  process.stderr.write(`lint: ${issues.length} issue(s)\n`);
  process.exit(1);
}

if (import.meta.main) {
  await main();
}
