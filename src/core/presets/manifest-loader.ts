import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { parse } from 'yaml'
import { InstallManifestSchema, ModelConfigSchema, type InstallManifest, type ModelConfig } from '../../validation/schemas'

const MANIFESTS_DIR = resolve(import.meta.dir, '..', '..', 'presets', 'manifests')
const MODELS_DIR = resolve(import.meta.dir, '..', '..', 'presets', 'models')
export const PRESETS_DIR = resolve(import.meta.dir, '..', '..', '..', 'presets')

export async function loadManifest(target: 'opencode' | 'claude' | 'codex'): Promise<InstallManifest> {
  const manifestPath = join(MANIFESTS_DIR, `${target}.yml`)
  const content = await readFile(manifestPath, 'utf-8')
  const data = parse(content)
  return InstallManifestSchema.parse(data)
}

export async function loadModelConfig(target: 'opencode' | 'claude' | 'codex'): Promise<ModelConfig> {
  const modelPath = join(MODELS_DIR, `${target}.yml`)
  const content = await readFile(modelPath, 'utf-8')
  const data = parse(content)
  return ModelConfigSchema.parse(data)
}