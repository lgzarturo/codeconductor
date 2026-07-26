import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject } from '../detection/project-detector';
import {
  validateCommandEnvelope,
  WorkflowCommandSchema,
  type CommandEnvelopeInput,
  type WorkflowCommandInput,
} from '../../validation/schemas';

export const CCEP_COMMANDS = WorkflowCommandSchema.options;

export type WorkflowCommand = WorkflowCommandInput;

const COMMAND_DEFAULTS: Record<
  WorkflowCommandInput,
  Pick<CommandEnvelopeInput['constraints'], 'outputFormat' | 'needConfirmation' | 'riskThreshold'>
> = {
  feature: { outputFormat: 'taskcard', needConfirmation: true, riskThreshold: 'medium' },
  fix: { outputFormat: 'taskcard', needConfirmation: true, riskThreshold: 'medium' },
  refactor: { outputFormat: 'taskcard', needConfirmation: true, riskThreshold: 'medium' },
  review: { outputFormat: 'verdict', needConfirmation: false, riskThreshold: 'low' },
  'test-plan': { outputFormat: 'plan', needConfirmation: true, riskThreshold: 'low' },
  'tdd-cycle': { outputFormat: 'taskcard', needConfirmation: false, riskThreshold: 'medium' },
  'api-contract': { outputFormat: 'plan', needConfirmation: true, riskThreshold: 'high' },
  'db-migration': { outputFormat: 'plan', needConfirmation: true, riskThreshold: 'high' },
  pagespeed: { outputFormat: 'verdict', needConfirmation: false, riskThreshold: 'low' },
  openspec: { outputFormat: 'taskcard', needConfirmation: true, riskThreshold: 'medium' },
  scorecard: { outputFormat: 'verdict', needConfirmation: false, riskThreshold: 'low' },
  council: { outputFormat: 'taskcard', needConfirmation: true, riskThreshold: 'medium' },
};

function readProjectId(projectRoot: string): string {
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { name?: string };
      if (pkg.name) {
        return pkg.name;
      }
    } catch {
      // fall through
    }
  }
  return projectRoot.split('/').pop() ?? 'unknown';
}

async function detectStack(projectRoot: string): Promise<string[]> {
  try {
    const profile = await detectProject(projectRoot);
    const stack = [...new Set([...profile.languages, ...profile.frameworks, ...profile.runtimes])];
    return stack.length > 0 ? stack : ['unknown'];
  } catch {
    return ['unknown'];
  }
}

export function parseCommand(
  command: WorkflowCommand,
  userRequest: string,
  projectRoot: string,
): CommandEnvelopeInput {
  const validatedCommand = WorkflowCommandSchema.parse(command);
  const constraints = COMMAND_DEFAULTS[validatedCommand];

  const envelope: CommandEnvelopeInput = {
    protocolVersion: 'ccep-1',
    command: validatedCommand,
    userRequest,
    projectId: readProjectId(projectRoot),
    repoContext: {
      stack: [],
      existingModules: [],
      architecture: 'modular',
    },
    constraints,
    executionPolicy: {
      modelMode: 'structured',
      maxVariance: 'low',
    },
  };

  // Synchronous parse; stack hydrated async in resolveContext. For sync API, detect inline.
  // detectProject is async — use minimal sync read for parseCommand contract.
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const stack: string[] = ['typescript'];
      if (deps?.next) stack.push('nextjs');
      if (deps?.react) stack.push('react');
      envelope.repoContext.stack = [...new Set(stack)];
    } catch {
      envelope.repoContext.stack = ['unknown'];
    }
  } else {
    envelope.repoContext.stack = ['unknown'];
  }

  return validateCommandEnvelope(envelope);
}

export async function parseCommandAsync(
  command: WorkflowCommand,
  userRequest: string,
  projectRoot: string,
): Promise<CommandEnvelopeInput> {
  const envelope = parseCommand(command, userRequest, projectRoot);
  envelope.repoContext.stack = await detectStack(projectRoot);
  return validateCommandEnvelope(envelope);
}
