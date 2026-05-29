import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  InstallManifestSchema,
  ModelConfigSchema,
  type InstallManifest,
  type ModelConfig,
} from '../../validation/schemas';
import { ROOT_PRESETS_DIR, SRC_PRESETS_DIR } from './package-paths';

const MANIFESTS_DIR = join(SRC_PRESETS_DIR, 'manifests');
const MODELS_DIR = join(SRC_PRESETS_DIR, 'models');
export const PRESETS_DIR = ROOT_PRESETS_DIR;

export async function loadManifest(
  target: 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor'
): Promise<InstallManifest> {
  const manifestPath = join(MANIFESTS_DIR, `${target}.yml`);
  const content = await readFile(manifestPath, 'utf-8');
  const data = parse(content);
  return InstallManifestSchema.parse(data);
}

export async function loadModelConfig(
  target: 'opencode' | 'claude' | 'codex' | 'gemini' | 'cursor'
): Promise<ModelConfig> {
  const modelPath = join(MODELS_DIR, `${target}.yml`);
  const content = await readFile(modelPath, 'utf-8');
  const data = parse(content);
  return ModelConfigSchema.parse(data);
}
