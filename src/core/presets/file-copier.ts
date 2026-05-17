import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { resolve, join, relative, dirname } from 'node:path'
import type { InstallManifest, ManifestEntry, InstallStrategy } from '../../validation/schemas'

export type FileAction = 'written' | 'appended' | 'merged' | 'skipped' | 'error'

export interface FileCopyResult {
  src: string
  dest: string
  action: FileAction
  dryRun?: boolean
  error?: string
}

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full, base)))
    } else {
      files.push(relative(base, full))
    }
  }
  return files
}

async function resolveEntryFiles(
  entry: ManifestEntry,
  presetsDir: string,
  baseDir: string
): Promise<Array<{ src: string; dest: string }>> {
  const srcAbsolute = resolve(presetsDir, entry.src)
  try {
    const s = await stat(srcAbsolute)
    if (s.isDirectory()) {
      const files = await listFilesRecursive(srcAbsolute)
      return files.map(f => ({
        src: join(srcAbsolute, f),
        dest: resolve(baseDir, entry.dest, f)
      }))
    }
    return [{ src: srcAbsolute, dest: resolve(baseDir, entry.dest) }]
  } catch {
    return []
  }
}

function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    const tgtVal = target[key]
    if (Array.isArray(srcVal) && Array.isArray(tgtVal)) {
      result[key] = [...new Set([...(tgtVal as unknown[]), ...(srcVal as unknown[])])]
    } else if (
      srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal) &&
      tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)
    ) {
      result[key] = mergeDeep(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>)
    } else {
      result[key] = srcVal
    }
  }
  return result
}

async function applySingleFile(
  srcPath: string,
  destPath: string,
  strategy: InstallStrategy,
  force: boolean,
  dryRun: boolean
): Promise<FileCopyResult> {
  if (strategy === 'skip') {
    return { src: srcPath, dest: destPath, action: 'skipped', dryRun }
  }

  let content: string
  try {
    content = await readFile(srcPath, 'utf-8')
  } catch (e) {
    return { src: srcPath, dest: destPath, action: 'error', error: `Cannot read source: ${e}` }
  }

  let finalContent = content
  let action: FileAction = 'written'

  if (strategy === 'append' && !force) {
    let existing = ''
    try { existing = await readFile(destPath, 'utf-8') } catch { /* no existing */ }
    if (existing) {
      finalContent = existing + '\n\n---\n\n' + content
    }
    action = 'appended'
  } else if (strategy === 'merge-json' && !force) {
    let existing: Record<string, unknown> = {}
    try {
      existing = JSON.parse(await readFile(destPath, 'utf-8')) as Record<string, unknown>
    } catch { /* no existing or invalid JSON */ }
    try {
      const incoming = JSON.parse(content) as Record<string, unknown>
      finalContent = JSON.stringify(mergeDeep(existing, incoming), null, 2)
    } catch (e) {
      return { src: srcPath, dest: destPath, action: 'error', error: `JSON merge failed: ${e}` }
    }
    action = 'merged'
  }

  if (dryRun) {
    return { src: srcPath, dest: destPath, action, dryRun: true }
  }

  try {
    await mkdir(dirname(destPath), { recursive: true })
    await writeFile(destPath, finalContent, 'utf-8')
    return { src: srcPath, dest: destPath, action }
  } catch (e) {
    return { src: srcPath, dest: destPath, action: 'error', error: String(e) }
  }
}

export async function copyFromManifest(
  manifest: InstallManifest,
  presetsDir: string,
  baseDir: string,
  isGlobal: boolean,
  dryRun: boolean,
  force: boolean
): Promise<FileCopyResult[]> {
  const results: FileCopyResult[] = []

  for (const entry of manifest.entries) {
    const strategy: InstallStrategy =
      isGlobal && entry.globalStrategy ? entry.globalStrategy : entry.strategy
    const files = await resolveEntryFiles(entry, presetsDir, baseDir)

    for (const { src, dest } of files) {
      results.push(await applySingleFile(src, dest, strategy, force, dryRun))
    }
  }

  return results
}
