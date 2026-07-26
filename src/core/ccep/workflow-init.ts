/**
 * Copy bundled CCEP workflow YAML profiles into a project.
 */
import { access, copyFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BUNDLED_WORKFLOWS_DIR } from '../ccep/profile-yaml';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initWorkflowArtifacts(
  baseDir: string,
  force: boolean,
): Promise<string[]> {
  const destDir = resolve(baseDir, '.codeconductor', 'workflows');
  await mkdir(destDir, { recursive: true });

  if (!(await fileExists(BUNDLED_WORKFLOWS_DIR))) {
    return [];
  }

  const created: string[] = [];
  const files = await readdir(BUNDLED_WORKFLOWS_DIR);

  for (const file of files) {
    if (!file.endsWith('.yml')) continue;
    const destPath = join(destDir, file);
    if (!force && (await fileExists(destPath))) {
      continue;
    }
    await copyFile(join(BUNDLED_WORKFLOWS_DIR, file), destPath);
    created.push(`.codeconductor/workflows/${file}`);
  }

  return created;
}
