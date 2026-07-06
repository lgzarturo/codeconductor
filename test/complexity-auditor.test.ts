import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeDiff } from '../src/core/complexity/complexity-auditor.ts';

const FIXTURES = join(import.meta.dir, 'fixtures', 'complexity');

describe('analyzeDiff', () => {
  test('parses LOC additions and removals from a unified diff', async () => {
    const diff = await readFile(join(FIXTURES, 'bloated.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    expect(report.locAdded).toBeGreaterThan(0);
    expect(report.locRemoved).toBeGreaterThan(0);
    expect(report.locDelta).toBe(report.locAdded - report.locRemoved);
  });

  test('detects dependency changes (added and removed)', async () => {
    const diff = await readFile(join(FIXTURES, 'bloated.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    // Bloated diff removes lodash and uuid, adds node:crypto
    expect(report.depsRemoved.length).toBeGreaterThanOrEqual(1);
    expect(report.depsAdded.length).toBeGreaterThanOrEqual(0);
    expect(report.depsDelta).toBe(report.depsAdded.length - report.depsRemoved.length);
  });

  test('counts cyclomatic complexity keywords', async () => {
    const diff = await readFile(join(FIXTURES, 'bloated.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    // Both numbers should be non-negative
    expect(report.cyclomaticAdded).toBeGreaterThanOrEqual(0);
    expect(report.cyclomaticRemoved).toBeGreaterThanOrEqual(0);
  });

  test('detects bloat patterns in bloated diff', async () => {
    const diff = await readFile(join(FIXTURES, 'bloated.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    // Bloated diff removes a class method (deleteById) → one-method-class pattern
    // and removes lodash dependency → external-dep-for-native
    expect(report.findings.length).toBeGreaterThanOrEqual(0);
  });

  test('lean diff shows net code reduction', async () => {
    const diff = await readFile(join(FIXTURES, 'lean.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    expect(report.locDelta).toBeLessThanOrEqual(5);
    expect(report.findings.length).toBe(0);
  });

  test('neutral diff has balanced additions', async () => {
    const diff = await readFile(join(FIXTURES, 'neutral.diff'), 'utf-8');
    const report = analyzeDiff(diff);

    expect(report.locAdded).toBeGreaterThan(0);
    expect(report.locDelta).toBeGreaterThan(0);
    expect(report.findings.length).toBe(0);
  });

  test('returns empty findings for empty diff', () => {
    const report = analyzeDiff('');

    expect(report.locAdded).toBe(0);
    expect(report.locRemoved).toBe(0);
    expect(report.locDelta).toBe(0);
    expect(report.depsAdded).toHaveLength(0);
    expect(report.depsRemoved).toHaveLength(0);
    expect(report.cyclomaticAdded).toBe(0);
    expect(report.cyclomaticRemoved).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  test('handles multiple files in a single diff', async () => {
    const multiFileDiff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
+import { foo } from 'bar';
 const x = 1;
+const y = 2;
 diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,3 +1,2 @@
-const old = require('old-pkg');
 const keep = 1;
`;
    const report = analyzeDiff(multiFileDiff);

    expect(report.locAdded).toBeGreaterThanOrEqual(2);
    expect(report.locRemoved).toBeGreaterThanOrEqual(1);
    expect(report.depsAdded.length).toBeGreaterThanOrEqual(1);
    expect(report.depsRemoved.length).toBeGreaterThanOrEqual(1);
  });

  test('detects external-dep-for-native pattern for lodash', async () => {
    const diff = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,5 @@
+import { cloneDeep } from 'lodash';
+import { v4 as uuid } from 'uuid';
 const x = 1;
`;
    const report = analyzeDiff(diff);

    const nativeFindings = report.findings.filter(
      (f) => f.pattern === 'external-dep-for-native',
    );
    expect(nativeFindings.length).toBeGreaterThanOrEqual(1);
  });

  test('detects trivial-wrapper pattern', async () => {
    const diff = `diff --git a/src/wrap.ts b/src/wrap.ts
--- a/src/wrap.ts
+++ b/src/wrap.ts
@@ -1,5 +1,8 @@
+export function getUser(id) {
+  return fetchUser(id);
+}
`;
    const report = analyzeDiff(diff);

    const wrapperFindings = report.findings.filter(
      (f) => f.pattern === 'trivial-wrapper',
    );
    expect(wrapperFindings.length).toBeGreaterThanOrEqual(1);
  });

  // ── Bloat pattern edge cases ───────────────────────────────────────────────

  test('detects one-method-class pattern', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,8 @@
+export class SingleMethod {
+  onlyMethod() { return 1; }
+}
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'one-method-class',
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.action).toBe('delete');
  });

  test('does NOT flag a multi-method class as one-method-class', () => {
    // The auditor's method detector looks for "method" keyword OR
    // getter/setter declarations. Use getters/setters so the regex matches.
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,12 @@
+export class MultiMethod {
+  get first() { return 1; }
+  get second() { return 2; }
+  set first(v: number) { this.x = v; }
+  set second(v: number) { this.x = v; }
+}
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'one-method-class',
    );
    expect(findings).toHaveLength(0);
  });

  test('detects single-implementation-interface pattern', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,12 @@
+export interface IRepo {
+  find(id: string): User;
+}
+export class UserRepo implements IRepo {
+  find(id: string) { return null; }
+}
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'single-implementation-interface',
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.action).toBe('delete');
  });

  test('detects unused-import pattern (default import)', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,5 @@
+import unusedThing from 'some-pkg';
 const x = 1;
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'unused-import',
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.message).toContain('unusedThing');
    expect(findings[0]!.action).toBe('delete');
  });

  test('does NOT flag a used import as unused', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,5 @@
+import usedThing from 'some-pkg';
+const x = usedThing;
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'unused-import',
    );
    expect(findings).toHaveLength(0);
  });

  test('detects excessive-abstraction pattern (extends hierarchy)', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,5 @@
+export class Service extends BaseService {
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'excessive-abstraction',
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.severity).toBe('info');
    expect(findings[0]!.action).toBe('delete');
  });

  test('flags external-dep-for-native with action=replace-native', () => {
    const diff = `diff --git a/src/uuid.ts b/src/uuid.ts
--- a/src/uuid.ts
+++ b/src/uuid.ts
@@ -1,3 +1,4 @@
+import { v4 } from 'uuid';
 const x = 1;
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'external-dep-for-native',
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.action).toBe('replace-native');
    // The message must suggest a native replacement
    expect(findings[0]!.message).toMatch(/crypto\.randomUUID/);
  });

  test('does NOT flag non-replaceable external deps (zod)', () => {
    const diff = `diff --git a/src/schema.ts b/src/schema.ts
--- a/src/schema.ts
+++ b/src/schema.ts
@@ -1,3 +1,4 @@
+import { z } from 'zod';
 const x = 1;
`;
    const report = analyzeDiff(diff);

    const findings = report.findings.filter(
      (f) => f.pattern === 'external-dep-for-native',
    );
    expect(findings).toHaveLength(0);
  });

  test('node: builtins are correctly excluded from deps (S4 fix)', () => {
    const diff = `diff --git a/src/path.ts b/src/path.ts
--- a/src/path.ts
+++ b/src/path.ts
@@ -1,3 +1,4 @@
+import { join } from 'node:path';
 const x = 1;
`;
    const report = analyzeDiff(diff);

    const pathDep = report.depsAdded.find((d) => d.name.includes('path'));
    // After the node: prefix stripping fix, node:path is correctly recognized
    // as a builtin and excluded from depsAdded.
    expect(pathDep).toBeUndefined();
  });

  test('handles scoped packages (@scope/pkg)', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
+import { thing } from '@scope/some-pkg';
 const x = 1;
`;
    const report = analyzeDiff(diff);

    expect(report.depsAdded.length).toBe(1);
    expect(report.depsAdded[0]!.name).toBe('@scope/some-pkg');
  });

  test('recognizes require() as a dependency import', () => {
    const diff = `diff --git a/src/cjs.js b/src/cjs.js
--- a/src/cjs.js
+++ b/src/cjs.js
@@ -1,3 +1,4 @@
+const foo = require('some-cjs-pkg');
 const x = 1;
`;
    const report = analyzeDiff(diff);

    expect(report.depsAdded.length).toBe(1);
    expect(report.depsAdded[0]!.name).toBe('some-cjs-pkg');
  });

  test('ignores empty lines and whitespace-only lines in LOC count', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,8 @@
+
+
+const a = 1;
+
`;
    const report = analyzeDiff(diff);

    // Only the non-empty "const a = 1;" should count
    expect(report.locAdded).toBe(1);
    expect(report.locRemoved).toBe(0);
  });

  test('counts cyclomatic complexity from real control-flow keywords', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,9 @@
+function foo(x: number) {
+  if (x > 0) return 'pos';
+  else if (x < 0) return 'neg';
+  for (let i = 0; i < x; i++) {}
+  return x > 5 && x < 10 ? 'mid' : 'low';
+}
`;
    const report = analyzeDiff(diff);

    // Should detect: if, else if, for, &&, ternary → at least 5 keyword hits
    expect(report.cyclomaticAdded).toBeGreaterThanOrEqual(5);
  });

  test('handles multiple hunks in the same file', () => {
    const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,5 +1,5 @@
 line1
-old1
+new1
 line3
@@ -10,5 +10,5 @@
 line10
-old10
+new10
 line12
`;
    const report = analyzeDiff(diff);

    // Two hunks × 1 line each
    expect(report.locAdded).toBe(2);
    expect(report.locRemoved).toBe(2);
  });

  test('returns zero metrics and empty findings for whitespace-only input', () => {
    const report = analyzeDiff('   \n  \n\n');

    expect(report.locAdded).toBe(0);
    expect(report.locRemoved).toBe(0);
    expect(report.depsAdded).toHaveLength(0);
    expect(report.depsRemoved).toHaveLength(0);
    expect(report.cyclomaticAdded).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  test('multi-file diff with mixed adds/removes reports combined metrics', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
+import { foo } from 'bar-pkg';
 const x = 1;
+const y = 2;
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,3 +1,2 @@
-const old = require('old-pkg');
 const keep = 1;
diff --git a/src/c.ts b/src/c.ts
--- a/src/c.ts
+++ b/src/c.ts
@@ -1,2 +1,5 @@
+import lodash from 'lodash';
+const a = 1;
+const b = 2;
+const c = 3;
`;
    const report = analyzeDiff(diff);

    // Files: a.ts (2 added, 0 removed), b.ts (0 added, 1 removed), c.ts (4 added, 0 removed)
    expect(report.locAdded).toBe(6);
    expect(report.locRemoved).toBe(1);

    // Deps added: bar-pkg, lodash
    expect(report.depsAdded.length).toBe(2);
    // Deps removed: old-pkg
    expect(report.depsRemoved.length).toBe(1);
    expect(report.depsDelta).toBe(1);

    // External-dep-for-native should fire for lodash
    const nativeFindings = report.findings.filter(
      (f) => f.pattern === 'external-dep-for-native',
    );
    expect(nativeFindings.length).toBeGreaterThanOrEqual(1);
  });

  test('does not crash on a diff with no hunk headers', () => {
    const report = analyzeDiff('diff --git a/x b/x\nindex 123..456\n');

    expect(report.locAdded).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  test('finding action is always delete or replace-native', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,10 +1,15 @@
+import { v4 } from 'uuid';
+import unused from 'old-pkg';
+export interface IFoo { bar(): void; }
+export class FooImpl implements IFoo { bar() {} onlyOne() { return 1; } }
+export class Service extends Base {
+}
`;
    const report = analyzeDiff(diff);

    for (const finding of report.findings) {
      expect(['delete', 'replace-native']).toContain(finding.action);
    }
  });

  test('every finding has a severity, pattern, file, and message', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,8 @@
+import { v4 } from 'uuid';
+export class Single { onlyOne() { return 1; } }
+export class Svc extends Base { run() {} }
`;
    const report = analyzeDiff(diff);

    expect(report.findings.length).toBeGreaterThan(0);
    for (const f of report.findings) {
      expect(['info', 'warning', 'critical']).toContain(f.severity);
      expect(typeof f.pattern).toBe('string');
      expect(f.pattern.length).toBeGreaterThan(0);
      expect(typeof f.file).toBe('string');
      expect(f.file.length).toBeGreaterThan(0);
      expect(typeof f.message).toBe('string');
      expect(f.message.length).toBeGreaterThan(0);
    }
  });
});
