import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { loadModelConfig } from '../presets/manifest-loader';
import type { ModelConfig } from '../../validation/schemas';
import {
  ExecutionProfileSchema,
  type ExecutionProfileInput,
  type OpenspecTaskCardPhaseInput,
} from '../../validation/schemas';
import { routePhaseToAgent } from '../openspec/agent-router';
import { err, ok, type Result } from '../../utils/result';

const PROFILE_FILE = '.codeconductor/evaluation/execution-profile.yml';

const PROFILE_AGENT_OVERRIDES: Record<
  ExecutionProfileInput['profile'],
  Partial<Record<string, string>>
> = {
  balanced: {},
  quality: {
    architect: 'strong',
    reviewer: 'strong',
    orchestrator: 'strong',
  },
  economical: {
    'repo-explorer': 'economical',
    tester: 'economical',
    docs: 'economical',
    'task-coach': 'economical',
  },
};

const ECONOMICAL_AGENTS = new Set([
  'repo-explorer',
  'tester',
  'docs',
  'task-coach',
  'goal-planner',
]);

const STRONG_AGENTS = new Set(['architect', 'reviewer', 'orchestrator']);

/**
 * Load execution profile from project or defaults.
 */
export async function loadExecutionProfile(
  projectRoot: string,
  defaultTarget: ExecutionProfileInput['target'] = 'opencode'
): Promise<ExecutionProfileInput> {
  try {
    const content = await readFile(resolve(projectRoot, PROFILE_FILE), 'utf-8');
    const data = parse(content);
    return ExecutionProfileSchema.parse(data);
  } catch {
    return ExecutionProfileSchema.parse({ profile: 'balanced', target: defaultTarget });
  }
}

function pickModelForAgent(
  modelConfig: ModelConfig,
  target: ExecutionProfileInput['target'],
  agentKey: string,
  profile: ExecutionProfileInput['profile']
): string | undefined {
  const agents = modelConfig.agents[agentKey];
  if (!agents) return undefined;

  const override = PROFILE_AGENT_OVERRIDES[profile][agentKey];
  if (override === 'economical' && ECONOMICAL_AGENTS.has(agentKey)) {
    // prefer flash/haiku tier — use same key, install-time already economical
  }
  if (override === 'strong' && STRONG_AGENTS.has(agentKey)) {
    // use configured model (already strong in matrix)
  }

  const t = target ?? modelConfig.target;
  return (
    agents[t] ??
    agents.opencode ??
    agents.claude ??
    Object.values(agents).find((v) => v !== undefined)
  );
}

export interface ResolvedPhaseModel {
  phase: OpenspecTaskCardPhaseInput;
  agent: string;
  model: string;
  modelKey: string;
  subagentDelegate: boolean;
}

/**
 * Resolve model per OpenSpec phase using profile + overrides.
 */
export async function resolvePhaseModels(
  projectRoot: string,
  target?: ExecutionProfileInput['target']
): Promise<Result<ResolvedPhaseModel[], Error>> {
  try {
    const profile = await loadExecutionProfile(projectRoot, target);
    const effectiveTarget = profile.target ?? target ?? 'opencode';
    const modelConfig = await loadModelConfig(effectiveTarget);

    const phases: OpenspecTaskCardPhaseInput[] = [
      'discover',
      'design',
      'test',
      'implement',
      'review',
    ];

    const delegateTesterReviewer =
      profile.subagentPolicy?.testerReviewer === 'delegate' ||
      profile.profile === 'economical';

    const resolved: ResolvedPhaseModel[] = [];
    for (const phase of phases) {
      const route = routePhaseToAgent(phase);
      const overrideModel = profile.overrides?.[route.agent] ?? profile.overrides?.[route.modelKey];
      const model =
        overrideModel ??
        pickModelForAgent(modelConfig, effectiveTarget, route.modelKey, profile.profile) ??
        'unknown';

      const subagentDelegate =
        (route.agent === 'tester' || route.agent === 'reviewer') && delegateTesterReviewer;

      resolved.push({
        phase,
        agent: route.agent,
        model,
        modelKey: route.modelKey,
        subagentDelegate,
      });
    }

    return ok(resolved);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Resolve model string for a single agent role.
 */
export async function resolveAgentModel(
  projectRoot: string,
  agentKey: string,
  target?: ExecutionProfileInput['target']
): Promise<Result<string, Error>> {
  try {
    const profile = await loadExecutionProfile(projectRoot, target);
    const effectiveTarget = profile.target ?? target ?? 'opencode';
    if (profile.overrides?.[agentKey]) {
      return ok(profile.overrides[agentKey]);
    }
    const modelConfig = await loadModelConfig(effectiveTarget);
    const model = pickModelForAgent(modelConfig, effectiveTarget, agentKey, profile.profile);
    return ok(model ?? 'unknown');
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
