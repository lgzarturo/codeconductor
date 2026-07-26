import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectProject } from '../detection/project-detector';
import {
  validateExecutionContext,
  ProductGraphSchema,
  type CommandEnvelopeInput,
  type ExecutionContextInput,
  type WorkflowProfileInput,
} from '../../validation/schemas';
import { parseCommand } from './command-parser';
import { productGraphPath } from '../product-graph/paths';
import { queryNodes } from '../product-graph/graph-store';

const DEFAULT_POLICIES: ExecutionContextInput['policies'] = {
  architecture: 'modular',
  testing: 'required',
  documentation: 'required',
  breakingChanges: 'approval',
};

async function loadProductKnowledge(projectRoot: string): Promise<Record<string, unknown>> {
  const graphPath = productGraphPath(projectRoot);
  if (!existsSync(graphPath)) {
    return {};
  }
  try {
    const raw = await readFile(graphPath, 'utf-8');
    const graph = ProductGraphSchema.parse(JSON.parse(raw));
    return {
      productName: graph.productName,
      domains: queryNodes(graph, 'domain').map((n) => n.name),
      decisions: queryNodes(graph, 'decision')
        .slice(0, 10)
        .map((n) => ({ id: n.id, name: n.name, data: n.data })),
      risks: queryNodes(graph, 'risk')
        .slice(0, 10)
        .map((n) => ({ id: n.id, name: n.name })),
      requirements: queryNodes(graph, 'requirement')
        .slice(0, 10)
        .map((n) => ({ id: n.id, name: n.name, status: (n.data as { status?: string }).status })),
      nodeCount: graph.nodes.length,
    };
  } catch {
    return {};
  }
}

async function resolveAstSource(
  projectRoot: string,
): Promise<ExecutionContextInput['ast']> {
  const graphPath = productGraphPath(projectRoot);
  if (existsSync(graphPath)) {
    return { source: 'product-graph', confidence: 'high' };
  }

  const graphifyPath = join(projectRoot, 'graphify-out', 'graph.json');
  if (existsSync(graphifyPath)) {
    return { source: 'graphify', confidence: 'medium' };
  }

  try {
    const profile = await detectProject(projectRoot);
    if (profile.signals.length > 0) {
      return { source: 'detect', confidence: profile.confidence };
    }
  } catch {
    // fall through
  }

  return { source: 'manual', confidence: 'low' };
}

export async function resolveContext(
  envelope: CommandEnvelopeInput,
  profile: WorkflowProfileInput,
  projectRoot: string,
): Promise<ExecutionContextInput> {
  const ast = await resolveAstSource(projectRoot);
  const knowledge = await loadProductKnowledge(projectRoot);
  const firstPhase = profile.phases[0];

  let stack = envelope.repoContext.stack;
  if (stack.length === 0 || (stack.length === 1 && stack[0] === 'unknown')) {
    try {
      const detected = await detectProject(projectRoot);
      stack = [...new Set([...detected.languages, ...detected.frameworks])];
    } catch {
      stack = envelope.repoContext.stack;
    }
  }

  const context: ExecutionContextInput = {
    envelope,
    profile,
    intent: {
      type: envelope.command,
      goal: envelope.userRequest,
      domain: envelope.repoContext.domain,
    },
    project: {
      name: envelope.projectId,
      rootDir: projectRoot,
      stack,
    },
    knowledge,
    ast,
    policies: DEFAULT_POLICIES,
    outputSchema: firstPhase?.outputSchema ?? profile.intakeSchema ?? 'agent-output',
  };

  return validateExecutionContext(context);
}

export async function resolveFromCommand(
  command: CommandEnvelopeInput['command'],
  userRequest: string,
  projectRoot: string,
  profile: WorkflowProfileInput,
): Promise<ExecutionContextInput> {
  const envelope = parseCommand(command, userRequest, projectRoot);
  return resolveContext(envelope, profile, projectRoot);
}
