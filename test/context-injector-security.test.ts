import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { injectScopedContext, loadDeferredFile } from '../src/core/context/context-injector';
import { readFileWithinRoot } from '../src/core/filesystem/path-containment';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const TEST_DIR = resolve(import.meta.dir, '.ctx-security-fixtures');
/** Sibling directory that shares the root prefix — catches naive startsWith checks. */
const SIBLING_PREFIX_DIR = `${TEST_DIR}-evil`;
/** Unrelated directory outside the root. */
const OUTSIDE_DIR = resolve(import.meta.dir, '.ctx-security-outside');

/**
 * Create a symlink, reporting whether the platform allowed it.
 *
 * Windows denies symlink creation without elevation or Developer Mode. Only
 * privilege errors are tolerated — any other failure is a real defect and
 * propagates.
 */
async function trySymlink(
  target: string,
  linkPath: string,
  type: 'file' | 'dir' | 'junction',
): Promise<boolean> {
  try {
    await symlink(target, linkPath, type);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      return false;
    }
    throw err;
  }
}

beforeEach(async () => {
  for (const dir of [TEST_DIR, SIBLING_PREFIX_DIR, OUTSIDE_DIR]) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }
  await mkdir(resolve(TEST_DIR, 'src'), { recursive: true });
});

afterEach(async () => {
  for (const dir of [TEST_DIR, SIBLING_PREFIX_DIR, OUTSIDE_DIR]) {
    await rm(dir, { recursive: true, force: true });
  }
});

// ─── Allowed paths (must never skip on any platform) ─────────────────────────

describe('context-injector path containment — allowed paths', () => {
  it('loads a plain relative file at the root', async () => {
    await writeFile(resolve(TEST_DIR, 'plain.ts'), 'plain content', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['plain.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(1);
    expect(payload.files['plain.ts']).toBe('plain content');
    expect(await loadDeferredFile(TEST_DIR, 'plain.ts')).toBe('plain content');
  });

  it('loads a regular copy of an external file placed inside the root', async () => {
    await writeFile(resolve(OUTSIDE_DIR, 'origin.ts'), 'copied content', 'utf-8');
    // A real copy — not a link — is legitimate content inside the root.
    await writeFile(resolve(TEST_DIR, 'src/copy.ts'), 'copied content', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/copy.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(1);
    expect(payload.files['src/copy.ts']).toBe('copied content');
    expect(await loadDeferredFile(TEST_DIR, 'src/copy.ts')).toBe('copied content');
  });

  it('loads files from nested subdirectories', async () => {
    await mkdir(resolve(TEST_DIR, 'src/deep/deeper'), { recursive: true });
    await writeFile(resolve(TEST_DIR, 'src/deep/deeper/nested.ts'), 'nested', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/deep/deeper/nested.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(1);
    expect(payload.files['src/deep/deeper/nested.ts']).toBe('nested');
    expect(await loadDeferredFile(TEST_DIR, 'src/deep/deeper/nested.ts')).toBe('nested');
  });

  it('loads a file whose relative path re-enters the root after traversal', async () => {
    await writeFile(resolve(TEST_DIR, 'src/inside.ts'), 'still inside', 'utf-8');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/../src/inside.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(1);
    expect(await loadDeferredFile(TEST_DIR, 'src/../src/inside.ts')).toBe('still inside');
  });
});

// ─── Rejected paths ──────────────────────────────────────────────────────────

describe('context-injector path containment — rejected paths', () => {
  it('rejects ../outside traversal', async () => {
    await writeFile(resolve(OUTSIDE_DIR, 'secret.ts'), 'OUTSIDE SECRET', 'utf-8');
    const relPath = `../${'.ctx-security-outside'}/secret.ts`;

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: [relPath],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.files[relPath]).toBeUndefined();
    expect(await loadDeferredFile(TEST_DIR, relPath)).toBeUndefined();
  });

  it('rejects a sibling directory sharing the root prefix', async () => {
    await writeFile(resolve(SIBLING_PREFIX_DIR, 'secret.ts'), 'SIBLING SECRET', 'utf-8');
    const relPath = '../.ctx-security-fixtures-evil/secret.ts';

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: [relPath],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.files[relPath]).toBeUndefined();
    expect(await loadDeferredFile(TEST_DIR, relPath)).toBeUndefined();
  });

  it('rejects an absolute path pointing outside the root', async () => {
    await writeFile(resolve(OUTSIDE_DIR, 'abs.ts'), 'ABSOLUTE OUTSIDE', 'utf-8');
    const absPath = resolve(OUTSIDE_DIR, 'abs.ts');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: [absPath],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.files[absPath]).toBeUndefined();
    expect(await loadDeferredFile(TEST_DIR, absPath)).toBeUndefined();
  });

  it('rejects an absolute path even when it points inside the root', async () => {
    // The scope contract is relative-only: absolute input is out of contract.
    await writeFile(resolve(TEST_DIR, 'src/internal.ts'), 'INTERNAL', 'utf-8');
    const absPath = resolve(TEST_DIR, 'src/internal.ts');

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: [absPath],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.files[absPath]).toBeUndefined();
    expect(await loadDeferredFile(TEST_DIR, absPath)).toBeUndefined();
  });
});

// ─── Symlink / junction containment ──────────────────────────────────────────

describe('context-injector path containment — links', () => {
  it('reads through a validated file handle rather than a path-only check', async () => {
    await writeFile(resolve(TEST_DIR, 'src/held.ts'), 'HELD', 'utf-8');

    expect(await readFileWithinRoot(TEST_DIR, 'src/held.ts')).toBe('HELD');
  });

  it('rejects a file symlink inside the root that targets an external file', async () => {
    await writeFile(resolve(OUTSIDE_DIR, 'target.ts'), 'LINKED SECRET', 'utf-8');
    const created = await trySymlink(
      resolve(OUTSIDE_DIR, 'target.ts'),
      resolve(TEST_DIR, 'src/link.ts'),
      'file',
    );
    if (!created) return; // platform denies symlink creation without privileges

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/link.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.files['src/link.ts']).toBeUndefined();
    expect(await loadDeferredFile(TEST_DIR, 'src/link.ts')).toBeUndefined();
  });

  it('rejects reads through a directory symlink that targets an external directory', async () => {
    await writeFile(resolve(OUTSIDE_DIR, 'inner.ts'), 'DIR LINK SECRET', 'utf-8');
    const created = await trySymlink(OUTSIDE_DIR, resolve(TEST_DIR, 'linkdir'), 'junction');
    if (!created) return;

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['linkdir/inner.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(0);
    expect(payload.files['linkdir/inner.ts']).toBeUndefined();
    expect(await loadDeferredFile(TEST_DIR, 'linkdir/inner.ts')).toBeUndefined();
  });

  it('allows a symlink inside the root that targets a file inside the root', async () => {
    await writeFile(resolve(TEST_DIR, 'src/real.ts'), 'INTERNAL LINK OK', 'utf-8');
    const created = await trySymlink(
      resolve(TEST_DIR, 'src/real.ts'),
      resolve(TEST_DIR, 'src/alias.ts'),
      'file',
    );
    if (!created) return;

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['src/alias.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(1);
    expect(payload.files['src/alias.ts']).toBe('INTERNAL LINK OK');
    expect(await loadDeferredFile(TEST_DIR, 'src/alias.ts')).toBe('INTERNAL LINK OK');
  });

  it('allows a directory junction inside the root that targets an internal directory', async () => {
    await mkdir(resolve(TEST_DIR, 'src/realdir'), { recursive: true });
    await writeFile(resolve(TEST_DIR, 'src/realdir/inner.ts'), 'INTERNAL DIR OK', 'utf-8');
    const created = await trySymlink(
      resolve(TEST_DIR, 'src/realdir'),
      resolve(TEST_DIR, 'aliasdir'),
      'junction',
    );
    if (!created) return;

    const payload = await injectScopedContext(TEST_DIR, {
      scopeFiles: ['aliasdir/inner.ts'],
      mode: 'isolated',
    });

    expect(payload.fileCount).toBe(1);
    expect(payload.files['aliasdir/inner.ts']).toBe('INTERNAL DIR OK');
    expect(await loadDeferredFile(TEST_DIR, 'aliasdir/inner.ts')).toBe('INTERNAL DIR OK');
  });
});

// ─── Existing limits still hold under the secure resolver ────────────────────

describe('context-injector path containment — preserved limits', () => {
  it('still defers files beyond the eager limit and skips escapes in the same scope', async () => {
    for (let i = 0; i < 12; i++) {
      await writeFile(resolve(TEST_DIR, `src/f${i}.ts`), `// ${i}`, 'utf-8');
    }
    await writeFile(resolve(OUTSIDE_DIR, 'escape.ts'), 'ESCAPE', 'utf-8');

    const scopeFiles = [
      '../.ctx-security-outside/escape.ts',
      ...Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`),
    ];
    const payload = await injectScopedContext(TEST_DIR, { scopeFiles, mode: 'isolated' });

    // 13 entries: first 10 eagerly attempted (1 rejected + 9 loaded), 3 deferred.
    expect(payload.fileCount).toBe(9);
    expect(payload.deferred).toHaveLength(3);
    expect(payload.files['../.ctx-security-outside/escape.ts']).toBeUndefined();
  });

  it('still truncates when maxContextBytes is exceeded', async () => {
    await writeFile(resolve(TEST_DIR, 'src/big1.ts'), 'x'.repeat(100), 'utf-8');
    await writeFile(resolve(TEST_DIR, 'src/big2.ts'), 'y'.repeat(100), 'utf-8');

    const payload = await injectScopedContext(
      TEST_DIR,
      { scopeFiles: ['src/big1.ts', 'src/big2.ts'], mode: 'isolated' },
      { maxContextBytes: 150 },
    );

    expect(payload.truncated).toBe(true);
    expect(payload.fileCount).toBe(1);
    expect(payload.totalBytes).toBe(100);
  });
});
