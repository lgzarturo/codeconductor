import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  validateWorkflowProfile,
  type WorkflowCommandInput,
  type WorkflowProfileInput,
} from '../../validation/schemas';
import { WORKFLOW_PROFILES } from './profiles';

/** Directory containing bundled default workflow YAML files. */
export const BUNDLED_WORKFLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'workflows');

export function workflowYamlPath(command: WorkflowCommandInput, projectRoot?: string): string | null {
  if (projectRoot) {
    const projectPath = join(projectRoot, '.codeconductor', 'workflows', `${command}.yml`);
    if (existsSync(projectPath)) {
      return projectPath;
    }
  }

  const bundledPath = join(BUNDLED_WORKFLOWS_DIR, `${command}.yml`);
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  return null;
}

export function parseWorkflowYaml(content: string): WorkflowProfileInput {
  const parsed = parseYaml(content);
  return validateWorkflowProfile(parsed);
}

export function loadWorkflowProfileFromYaml(
  command: WorkflowCommandInput,
  projectRoot?: string,
): WorkflowProfileInput | null {
  const path = workflowYamlPath(command, projectRoot);
  if (!path) {
    return null;
  }
  const content = readFileSync(path, 'utf-8');
  return parseWorkflowYaml(content);
}

export function loadWorkflowProfileFallback(
  command: WorkflowCommandInput,
): WorkflowProfileInput {
  const profile = WORKFLOW_PROFILES[command];
  if (!profile) {
    throw new Error(`Unknown workflow command: ${command}`);
  }
  return validateWorkflowProfile(profile);
}
