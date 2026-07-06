import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * AC6 — Phase 1 introduced only stdlib modules. No new external
 * dependencies are allowed in package.json.
 *
 * This test pins the current dependency set as the "Phase 1 baseline"
 * and fails if anyone adds a new production dependency.
 *
 * Update the snapshot ONLY when an explicitly-approved dependency is
 * added in a later phase.
 */

const REPO_ROOT = join(import.meta.dir, '..');
const PACKAGE_JSON = join(REPO_ROOT, 'package.json');

interface PackageJsonShape {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

async function readPackageJson(): Promise<PackageJsonShape> {
  const raw = await readFile(PACKAGE_JSON, 'utf-8');
  return JSON.parse(raw) as PackageJsonShape;
}

const BASELINE_DEPENDENCIES = Object.freeze(['zod', 'yaml']);
const BASELINE_DEV_DEPENDENCIES = Object.freeze(['@types/bun', 'typescript']);

describe('Phase 1 AC6 — no new external dependencies', () => {
  test('production dependencies match the Phase 1 baseline', async () => {
    const pkg = await readPackageJson();
    const deps = Object.keys(pkg.dependencies ?? {}).sort();
    expect(deps).toEqual([...BASELINE_DEPENDENCIES].sort());
  });

  test('dev dependencies match the Phase 1 baseline', async () => {
    const pkg = await readPackageJson();
    const devDeps = Object.keys(pkg.devDependencies ?? {}).sort();
    expect(devDeps).toEqual([...BASELINE_DEV_DEPENDENCIES].sort());
  });

  test('no dependency is marked as bundled-only / missing version', async () => {
    const pkg = await readPackageJson();
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
      expect(name).not.toMatch(/[A-Z]/); // no uppercase package names
    }
  });
});

describe('Phase 1 AC6 — Phase 1 source files use only node:* imports', () => {
  test('debt-harvest.command.ts only imports from node:* or relative', async () => {
    const src = await readFile(
      join(REPO_ROOT, 'src/commands/debt-harvest.command.ts'),
      'utf-8',
    );

    // Extract every "from '...'" module specifier
    const specifiers = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

    // No third-party imports: every specifier must be node:*, ./, or ../
    for (const spec of specifiers) {
      expect(spec).toMatch(/^(node:|\.\/|\.\.\/)/);
    }
  });

  test('help.command.ts only imports from node:* or relative', async () => {
    const src = await readFile(
      join(REPO_ROOT, 'src/commands/help.command.ts'),
      'utf-8',
    );

    const specifiers = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

    for (const spec of specifiers) {
      expect(spec).toMatch(/^(node:|\.\/|\.\.\/)/);
    }
  });
});
