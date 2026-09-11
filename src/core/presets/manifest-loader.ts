import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  InstallManifestSchema,
  ModelConfigSchema,
  TargetCapabilitiesSchema,
  type InstallManifest,
  type ModelConfig,
  type TargetCapabilities,
} from '../../validation/schemas';
import type { IndividualRunnerTarget } from '../runner/runner-target';
import { ROOT_PRESETS_DIR, SRC_PRESETS_DIR } from './package-paths';

const MANIFESTS_DIR = join(SRC_PRESETS_DIR, 'manifests');
const MODELS_DIR = join(SRC_PRESETS_DIR, 'models');
const TARGETS_DIR = join(SRC_PRESETS_DIR, 'targets');
export const PRESETS_DIR = ROOT_PRESETS_DIR;

export async function loadManifest(
  target: IndividualRunnerTarget
): Promise<InstallManifest> {
  const manifestPath = join(MANIFESTS_DIR, `${target}.yml`);
  const content = await readFile(manifestPath, 'utf-8');
  const data = parse(content);
  return InstallManifestSchema.parse(data);
}

/**
 * The 14 agent roles x 7 providers and the 7 tool-name mappings are the same
 * across every target — only opencode's permission-block override differs.
 * roles.yml is that shared table; each target's own <target>.yml carries
 * just `target:` plus (opencode only) a `permissions:` override that takes
 * precedence over roles.yml's `tools:` table.
 */
export async function loadModelConfig(
  target: IndividualRunnerTarget
): Promise<ModelConfig> {
  const [rolesRaw, targetRaw] = await Promise.all([
    readFile(join(MODELS_DIR, 'roles.yml'), 'utf-8'),
    readFile(join(MODELS_DIR, `${target}.yml`), 'utf-8'),
  ]);
  const roles = parse(rolesRaw) as Pick<ModelConfig, 'agents' | 'tools'>;
  const targetData = parse(targetRaw) as Pick<ModelConfig, 'target' | 'permissions'>;

  return ModelConfigSchema.parse({
    target: targetData.target,
    agents: roles.agents,
    tools: targetData.permissions ? undefined : roles.tools,
    permissions: targetData.permissions,
  });
}

/**
 * Target capability matrix (CCHS v1, docs/harness-spec.md) — see
 * src/presets/targets/<target>.yml.
 */
export async function loadTargetCapabilities(
  target: IndividualRunnerTarget
): Promise<TargetCapabilities> {
  const content = await readFile(join(TARGETS_DIR, `${target}.yml`), 'utf-8');
  return TargetCapabilitiesSchema.parse(parse(content));
}
