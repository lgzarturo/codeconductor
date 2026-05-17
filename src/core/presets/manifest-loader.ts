import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parse } from 'yaml'
import { InstallManifestSchema, type InstallManifest } from '../../validation/schemas'

const MANIFESTS_DIR = resolve(import.meta.dir, '..', '..', 'presets', 'manifests')
export const PRESETS_DIR = resolve(import.meta.dir, '..', '..', '..', 'presets')

export async function loadManifest(target: 'opencode' | 'claude' | 'codex'): Promise<InstallManifest> {
  const manifestPath = join(MANIFESTS_DIR, `${target}.yml`)
  const content = await readFile(manifestPath, 'utf-8')
  const data = parse(content)
  return InstallManifestSchema.parse(data)
}
