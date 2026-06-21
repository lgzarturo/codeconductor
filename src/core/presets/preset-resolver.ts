import type { RunnerTargetInput } from '../../validation/schemas';
import type { DetectionConfidence, ProjectProfile } from '../detection/project-detector';

export type PresetStack =
  | 'node'
  | 'bun'
  | 'spring'
  | 'django'
  | 'astro'
  | 'nextjs'
  | 'fastapi'
  | 'backend'
  | 'frontend'
  | 'unknown';
export type ProjectArchitecture = 'single-project' | 'monorepo' | 'unknown';

export interface PresetResolution {
  readonly target: Exclude<RunnerTargetInput, 'all'>;
  readonly stack: PresetStack;
  readonly architecture: ProjectArchitecture;
  readonly confidence: DetectionConfidence;
  readonly presetVersion: string;
  readonly assets: readonly string[];
  readonly warnings: readonly string[];
}

const CURRENT_PRESET_VERSION = 'v0.3.0';

export function resolvePreset(
  target: Exclude<RunnerTargetInput, 'all'>,
  profile: Pick<ProjectProfile, 'frameworks' | 'runtimes' | 'signals' | 'confidence'>
): PresetResolution {
  const stack = resolveStack(profile);
  const isMonorepo = profile.signals.some((s) =>
    [
      'pnpm-workspace.yaml',
      'lerna.json',
      'go.work',
      'package.json-workspaces',
      'Cargo.toml-workspace',
    ].includes(s)
  );
  const architecture: ProjectArchitecture = isMonorepo
    ? 'monorepo'
    : profile.signals.length > 0
      ? 'single-project'
      : 'unknown';
  const warnings: string[] = [];

  if (profile.confidence === 'low') {
    warnings.push('Detection confidence is low; review the selected preset before applying it.');
  }

  if (stack === 'unknown') {
    warnings.push(
      'No supported stack was detected; using the generic CodeConductor workflow preset.'
    );
  } else {
    warnings.push(
      `${stack} projects currently receive the generic ${target} workflow plus matching skills; stack-specific asset pruning is not implemented yet.`
    );
  }

  if (architecture === 'unknown') {
    warnings.push('Project architecture could not be inferred from available signals.');
  }

  return {
    target,
    stack,
    architecture,
    confidence: profile.confidence,
    presetVersion: CURRENT_PRESET_VERSION,
    assets: resolveAssets(target),
    warnings,
  };
}

function resolveStack(profile: Pick<ProjectProfile, 'frameworks' | 'runtimes'>): PresetStack {
  if (profile.frameworks.includes('spring')) return 'spring';
  if (profile.frameworks.includes('django')) return 'django';
  if (profile.frameworks.includes('astro')) return 'astro';
  if (profile.frameworks.includes('nextjs')) return 'nextjs';
  if (profile.frameworks.includes('fastapi')) return 'fastapi';
  if (profile.frameworks.includes('backend')) return 'backend';
  if (profile.frameworks.includes('frontend')) return 'frontend';
  if (profile.runtimes.includes('bun')) return 'bun';
  if (profile.runtimes.includes('node')) return 'node';
  return 'unknown';
}

function resolveAssets(target: Exclude<RunnerTargetInput, 'all'>): string[] {
  switch (target) {
    case 'opencode':
      return ['opencode.jsonc', 'agents', 'commands', 'prompts/v0.3.0', 'skills'];
    case 'claude':
      return ['CLAUDE.md', 'settings.json', 'commands', 'skills', 'agents', 'prompts/v0.3.0'];
    case 'codex':
      return ['AGENTS.md', 'skills', 'prompts/v0.3.0'];
    case 'gemini':
      return ['agents', 'prompts/v0.3.0'];
    case 'cursor':
      return ['agents', 'prompts/v0.3.0'];
    case 'agy':
      return ['AGENTS.md', 'rules', 'workflows', 'skills', 'prompts/v0.3.0'];
  }
}
