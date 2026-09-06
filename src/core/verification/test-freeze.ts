import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';

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
      const s = await stat(currentPath);
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

export async function freezeTestSuite(dirs: string[], lockDir: string): Promise<FreezeManifest> {
  const basePath = process.cwd(); // Wait, the spec says "basePath" but `freezeTestSuite` does not take basePath. The signature is freezeTestSuite(dirs: string[], lockDir: string). I'll use lockDir as basePath or process.cwd(). Let's use process.cwd() as basePath for collectFiles? No, let's use process.cwd() if basePath is not provided. But let's assume `lockDir` is not the basePath. Let's just use process.cwd(). Wait, `verifyTestFreeze` takes `basePath: string`. So I'll modify `freezeTestSuite` to just use process.cwd().
  const files = await collectFiles(dirs, process.cwd());
  
  const fileInfos = [];
  for (const file of files) {
    const hash = await hashFile(join(process.cwd(), file));
    fileInfos.push({ path: file, hash });
  }

  const hashContent = fileInfos.map(f => `${f.path}\0${f.hash}`).join('\n');
  const aggregateHash = createHash('sha256').update(hashContent).digest('hex');

  const manifest: FreezeManifest = {
    hash: aggregateHash,
    files: fileInfos,
    frozenAt: new Date().toISOString()
  };

  await writeFile(join(lockDir, 'test-freeze.lock'), JSON.stringify(manifest, null, 2), 'utf-8');
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
    return JSON.parse(content) as FreezeManifest;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw e;
  }
}
