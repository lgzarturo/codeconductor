import type { WorkflowCommandInput, WorkflowProfileInput } from '../../validation/schemas';
import { loadWorkflowProfileFallback, loadWorkflowProfileFromYaml } from './profile-yaml';
import { WORKFLOW_PROFILES } from './profiles';

export interface ResolvedWorkflowPhase {
  readonly id: string;
  readonly role: string;
  readonly roles: readonly string[];
  readonly outputSchema: string;
}

export function resolveWorkflowPhase(
  profile: WorkflowProfileInput,
  phaseId: string,
): ResolvedWorkflowPhase | null {
  const phase = profile.phases.find((p) => p.id === phaseId);
  if (!phase) {
    return null;
  }
  const roles: readonly string[] =
    phase.agent !== undefined
      ? [phase.agent]
      : phase.agents !== undefined && phase.agents.length > 0
        ? [...phase.agents]
        : ['orchestrator'];
  const outputSchema = phase.outputSchema ?? profile.intakeSchema ?? 'agent-output';
  return { id: phase.id, role: roles[0], roles, outputSchema };
}

export function loadWorkflowProfile(
  command: WorkflowCommandInput,
  projectRoot?: string,
): WorkflowProfileInput {
  const fromYaml = loadWorkflowProfileFromYaml(command, projectRoot);
  if (fromYaml) {
    return fromYaml;
  }
  return loadWorkflowProfileFallback(command);
}

export function loadAllWorkflowProfiles(
  projectRoot?: string,
): Map<WorkflowCommandInput, WorkflowProfileInput> {
  const map = new Map<WorkflowCommandInput, WorkflowProfileInput>();
  for (const command of Object.keys(WORKFLOW_PROFILES) as WorkflowCommandInput[]) {
    map.set(command, loadWorkflowProfile(command, projectRoot));
  }
  return map;
}
