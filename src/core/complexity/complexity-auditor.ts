import type {
  AuditorSeverity,
  BloatPattern,
  ComplexityAuditReport,
  ComplexityFinding,
  DepChange,
  FindingAction,
} from './types.ts';

// ── Diff parsing ──────────────────────────────────────────────────────────────

interface DiffHunk {
  file: string;
  addedLines: string[];
  removedLines: string[];
}

const DIFF_FILE_REGEX = /^\+\+\+ b\/(.+)$/;
const HUNK_HEADER_REGEX = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseDiffHunks(diffContent: string): DiffHunk[] {
  const lines = diffContent.split('\n');
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;

  for (const line of lines) {
    const fileMatch = line.match(DIFF_FILE_REGEX);
    if (fileMatch) {
      current = { file: fileMatch[1], addedLines: [], removedLines: [] };
      hunks.push(current);
      continue;
    }

    if (HUNK_HEADER_REGEX.test(line)) {
      // New hunk within same file
      if (current) {
        const newHunk: DiffHunk = {
          file: current.file,
          addedLines: [],
          removedLines: [],
        };
        hunks.push(newHunk);
        current = newHunk;
      }
      continue;
    }

    if (!current) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.addedLines.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.removedLines.push(line.slice(1));
    }
  }

  return hunks;
}

// ── LOC analysis ──────────────────────────────────────────────────────────────

function countNonEmptyLines(lines: string[]): number {
  return lines.filter((l) => l.trim().length > 0).length;
}

function analyzeLoc(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    added += countNonEmptyLines(hunk.addedLines);
    removed += countNonEmptyLines(hunk.removedLines);
  }
  return { added, removed };
}

// ── Dependency analysis ───────────────────────────────────────────────────────

const IMPORT_REGEX = /^import\s+(?:.*from\s+)?['"]([^'"]+)['"]/;
const REQUIRE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
  'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
]);

function isExternalDep(specifier: string): boolean {
  const cleaned = specifier.replace(/^node:/, '');
  if (cleaned.startsWith('.') || cleaned.startsWith('/')) return false;
  const pkg = cleaned.startsWith('@')
    ? cleaned.split('/').slice(0, 2).join('/')
    : cleaned.split('/')[0];
  return !NODE_BUILTINS.has(pkg);
}

function analyzeDeps(hunks: DiffHunk[]): { added: DepChange[]; removed: DepChange[] } {
  const added: DepChange[] = [];
  const removed: DepChange[] = [];

  for (const hunk of hunks) {
    for (const line of hunk.addedLines) {
      const match = line.match(IMPORT_REGEX) || line.match(REQUIRE_REGEX);
      if (match && isExternalDep(match[1])) {
        added.push({ name: match[1], type: 'import', file: hunk.file });
      }
    }
    for (const line of hunk.removedLines) {
      const match = line.match(IMPORT_REGEX) || line.match(REQUIRE_REGEX);
      if (match && isExternalDep(match[1])) {
        removed.push({ name: match[1], type: 'import', file: hunk.file });
      }
    }
  }

  return { added, removed };
}

// ── Cyclomatic complexity heuristic ───────────────────────────────────────────

const COMPLEXITY_KEYWORDS = [
  /\bif\s*\(/,
  /\belse\s+if\b/,
  /\bfor\s*\(/,
  /\bwhile\s*\(/,
  /\bswitch\s*\(/,
  /\bcase\s+/,
  /\bcatch\s*\(/,
  /\b\?\s*[^.]/, // ternary — avoid matching optional chaining (?.)
  /&&/,
  /\|\|/,
];

function countComplexityKeywords(lines: string[]): number {
  let count = 0;
  for (const line of lines) {
    for (const regex of COMPLEXITY_KEYWORDS) {
      if (regex.test(line)) count++;
    }
  }
  return count;
}

function analyzeComplexity(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    added += countComplexityKeywords(hunk.addedLines);
    removed += countComplexityKeywords(hunk.removedLines);
  }
  return { added, removed };
}

// ── Bloat pattern detection ───────────────────────────────────────────────────

function detectBloatPatterns(hunks: DiffHunk[]): ComplexityFinding[] {
  const findings: ComplexityFinding[] = [];

  for (const hunk of hunks) {
    const allLines = [...hunk.addedLines];

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      const lineNum = i + 1;

      // Single-implementation interface
      if (/^\s*export\s+interface\s+\w+/.test(line)) {
        const hasSingleImpl =
          hunk.addedLines.some((l) =>
            /implements\s+\w+/.test(l) || /implements\s+\{/.test(l),
          );
        if (hasSingleImpl) {
          findings.push({
            severity: 'warning',
            pattern: 'single-implementation-interface',
            file: hunk.file,
            line: lineNum,
            message: 'Interface with only one implementation — consider a concrete class',
            action: 'delete',
          });
        }
      }

      // Trivial wrapper — function that only delegates
      if (/^\s*(export\s+)?(async\s+)?function\s+(\w+)/.test(line)) {
        const funcBody = allLines.slice(i + 1, i + 5).join('\n');
        if (/return\s+\w+\s*\(/.test(funcBody) && funcBody.split('\n').filter((l) => l.trim()).length <= 3) {
          findings.push({
            severity: 'info',
            pattern: 'trivial-wrapper',
            file: hunk.file,
            line: lineNum,
            message: 'Function appears to be a trivial wrapper — callers could invoke directly',
            action: 'delete',
          });
        }
      }

      // One-method class
      if (/^\s*(export\s+)?class\s+(\w+)/.test(line)) {
        const classBlock = allLines.slice(i + 1, i + 20).join('\n');
        const methodCount = (classBlock.match(/\b(method|get\s+\w+|set\s+\w+)\s*\(/g) || []).length;
        if (methodCount <= 1) {
          findings.push({
            severity: 'warning',
            pattern: 'one-method-class',
            file: hunk.file,
            line: lineNum,
            message: 'Class with only one method — a function may suffice',
            action: 'delete',
          });
        }
      }

      // Unused import detection (basic heuristic: imported name not used in remaining lines)
      if (/^\s*import\s+(\w+)/.test(line)) {
        const importedName = line.match(/import\s+(\w+)/)?.[1];
        if (importedName) {
          const restOfFile = allLines.join('\n');
          // Only check lines after the import
          const afterImport = allLines.slice(i + 1).join('\n');
          if (!afterImport.includes(importedName)) {
            findings.push({
              severity: 'info',
              pattern: 'unused-import',
              file: hunk.file,
              line: lineNum,
              message: `Import "${importedName}" does not appear used in added code`,
              action: 'delete',
            });
          }
        }
      }

      // External dependency for native functionality
      if (/^\s*import\s+.*from\s+['"]/.test(line)) {
        const depMatch = line.match(/from\s+['"]([^'"]+)['"]/);
        if (depMatch && isExternalDep(depMatch[1])) {
          const pkg = depMatch[1].startsWith('@')
            ? depMatch[1].split('/').slice(0, 2).join('/')
            : depMatch[1].split('/')[0];
          if (NATIVE_REPLACEMENTS.has(pkg)) {
            findings.push({
              severity: 'warning',
              pattern: 'external-dep-for-native',
              file: hunk.file,
              line: lineNum,
              message: `"${pkg}" can be replaced with native: ${NATIVE_REPLACEMENTS.get(pkg)}`,
              action: 'replace-native',
            });
          }
        }
      }

      // Excessive abstraction
      if (/^\s*(export\s+)?(abstract\s+)?class\s+(\w+).*extends\s+(\w+)/.test(line)) {
        findings.push({
          severity: 'info',
          pattern: 'excessive-abstraction',
          file: hunk.file,
          line: lineNum,
          message: 'Deep class hierarchy — consider composition over inheritance',
          action: 'delete',
        });
      }
    }
  }

  return findings;
}

const NATIVE_REPLACEMENTS = new Map([
  ['lodash', 'Array/Object native methods'],
  ['lodash-es', 'Array/Object native methods'],
  ['underscore', 'Array/Object native methods'],
  ['moment', 'Intl.DateTimeFormat, Date.parse, Temporal API'],
  ['date-fns', 'Intl.DateTimeFormat, Date methods'],
  ['axios', 'node:https or fetch()'],
  ['node-fetch', 'node:https or global fetch'],
  ['uuid', 'crypto.randomUUID()'],
  ['qs', 'URLSearchParams'],
  ['semver', 'node:semver (stdlib)'],
  ['chalk', 'ANSI escape codes'],
]);

// ── Public API ────────────────────────────────────────────────────────────────

export function analyzeDiff(diffContent: string): ComplexityAuditReport {
  const hunks = parseDiffHunks(diffContent);

  const loc = analyzeLoc(hunks);
  const deps = analyzeDeps(hunks);
  const complexity = analyzeComplexity(hunks);
  const findings = detectBloatPatterns(hunks);

  return {
    locAdded: loc.added,
    locRemoved: loc.removed,
    locDelta: loc.added - loc.removed,
    depsAdded: deps.added,
    depsRemoved: deps.removed,
    depsDelta: deps.added.length - deps.removed.length,
    cyclomaticAdded: complexity.added,
    cyclomaticRemoved: complexity.removed,
    cyclomaticDelta: complexity.added - complexity.removed,
    findings,
  };
}
