import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { readdir, readFile, open, lstat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { z } from 'zod';

export const FREEZE_LOCK_FILE = 'test-freeze.lock';

const FreezeManifestSchema = z.object({
  hash: z.string(),
  files: z.array(z.object({ path: z.string(), hash: z.string() })),
  frozenAt: z.string(),
});

export interface FreezeManifest {
  hash: string;
  files: { path: string; hash: string }[];
  frozenAt: string;
}

export interface VerifyResult {
  valid: boolean;
  expectedHash: string;
  actualHash: string;
  tamperedFiles: string[];
}

async function collectFiles(dirs: string[], basePath: string): Promise<string[]> {
  const allFiles: string[] = [];

  async function walk(currentPath: string) {
    try {
      const s = await lstat(currentPath);
      if (s.isSymbolicLink()) {
        throw new Error(`Symlink in sealed set: ${relative(basePath, currentPath)}`);
      }
      if (s.isDirectory()) {
        const entries = await readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          await walk(join(currentPath, entry.name));
        }
      } else if (s.isFile()) {
        allFiles.push(relative(basePath, currentPath));
      }
    } catch (e) {
      // Ignore missing paths (e.g. if a dir doesn't exist)
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }
  }

  for (const dir of dirs) {
    const fullDir = isAbsolute(dir) ? dir : join(basePath, dir);
    await walk(fullDir);
  }

  return allFiles.sort();
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export async function freezeTestSuite(
  dirs: string[],
  lockDir: string,
  basePath: string = process.cwd(),
): Promise<FreezeManifest> {
  // Consumers: runWorkflowPipeline() (experimental, library-only) and the harness
  // (src/core/verification/harness). The production gate is rdd-receipt.ts.
  const files = await collectFiles(dirs, basePath);
  
  const fileInfos = [];
  for (const file of files) {
    const hash = await hashFile(join(basePath, file));
    fileInfos.push({ path: file, hash });
  }

  const hashContent = fileInfos.map(f => `${f.path}\0${f.hash}`).join('\n');
  const aggregateHash = createHash('sha256').update(hashContent).digest('hex');

  const manifest: FreezeManifest = {
    hash: aggregateHash,
    files: fileInfos,
    frozenAt: new Date().toISOString()
  };

  // O_NOFOLLOW: a lock path that is a symlink must fail, not be written through.
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(join(lockDir, FREEZE_LOCK_FILE), flags, 0o644);
  try {
    await handle.writeFile(JSON.stringify(manifest, null, 2), 'utf-8');
  } finally {
    await handle.close();
  }
  return manifest;
}

export async function verifyTestFreeze(lockPath: string, dirs: string[], basePath: string): Promise<VerifyResult> {
  const manifest = await readFreezeLock(lockPath);
  if (!manifest) {
    throw new Error('Lock file not found');
  }

  const files = await collectFiles(dirs, basePath);
  
  const fileInfos = [];
  for (const file of files) {
    const hash = await hashFile(join(basePath, file));
    fileInfos.push({ path: file, hash });
  }

  const hashContent = fileInfos.map(f => `${f.path}\0${f.hash}`).join('\n');
  const aggregateHash = createHash('sha256').update(hashContent).digest('hex');

  const tamperedFiles: string[] = [];
  const manifestFileMap = new Map(manifest.files.map(f => [f.path, f.hash]));
  const currentFileMap = new Map(fileInfos.map(f => [f.path, f.hash]));

  // Check for modifications, additions, and deletions
  for (const [path, hash] of currentFileMap.entries()) {
    if (manifestFileMap.get(path) !== hash) {
      tamperedFiles.push(path);
    }
  }

  for (const [path] of manifestFileMap.entries()) {
    if (!currentFileMap.has(path) && !tamperedFiles.includes(path)) {
      tamperedFiles.push(path);
    }
  }

  tamperedFiles.sort();

  return {
    valid: aggregateHash === manifest.hash && tamperedFiles.length === 0,
    expectedHash: manifest.hash,
    actualHash: aggregateHash,
    tamperedFiles
  };
}

export async function readFreezeLock(lockPath: string): Promise<FreezeManifest | null> {
  try {
    const content = await readFile(lockPath, 'utf-8');
    return FreezeManifestSchema.parse(JSON.parse(content));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw e;
  }
}
