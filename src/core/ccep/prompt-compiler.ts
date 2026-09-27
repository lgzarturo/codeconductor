import type { ExecutionContextInput } from '../../validation/schemas';
import { buildOpenspecPhaseContext } from '../openspec/openspec-context';
import { resolveOutputSchemaName } from './output-validator';

export interface PromptLayer {
  readonly name:
    | 'system'
    | 'agent'
    | 'policies'
    | 'knowledge'
    | 'ast'
    | 'task'
    | 'output_schema';
  readonly content: string;
}

export interface CompiledPrompt {
  readonly layers: readonly PromptLayer[];
  readonly prompt: string;
  readonly outputSchema: string;
}

const ROLE_LABELS: Record<string, string> = {
  'task-coach': 'Task Coach',
  architect: 'Architect',
  implementer: 'Implementer',
  tester: 'Tester',
  reviewer: 'Reviewer',
  docs: 'Docs',
  'contract-builder': 'Contract Builder',
  'complexity-auditor': 'Complexity Auditor',
  orchestrator: 'Orchestrator',
  'repo-explorer': 'Repo Explorer',
};

const OUTPUT_SCHEMAS: Record<string, string> = {
  'planner-output': `{
  "status": "success" | "needs_clarification",
  "confidence": 0.0,
  "goal": "",
  "assumptions": [],
  "risks": [],
  "tasks": [],
  "questionsForUser": [],
  "needsConfirmation": true
}`,
  'council-verdict': `{
  "status": "APPROVED" | "REJECTED" | "ESCALATED",
  "totalAgents": 0,
  "approvedCount": 0,
  "rejectedCount": 0,
  "abstainedCount": 0,
  "vetoApplied": false,
  "findings": [],
  "summary": "",
  "individualVerdicts": []
}`,
  'technical-plan': '{ "approach": "", "filesAffected": [], "risks": [] }',
  'fix-intake-output': '{ "actualBehavior": "", "expectedBehavior": "", "reproductionSteps": [] }',
  'review-report': `{
  "status": "pass" | "fail",
  "confidence": 0.0,
  "verdict": "approved" | "approved_with_warnings" | "blocked",
  "warnings": [],
  "findings": [{ "severity": "CRITICAL" | "WARNING" | "SUGGESTION", "message": "", "axis": "" }],
  "artifacts": [],
  "next_actions": []
}`,
  'implementer-output': `{
  "status": "success" | "failure" | "blocked",
  "confidence": 0.0,
  "warnings": [],
  "artifacts": [],
  "next_actions": [],
  "filesChanged": [{ "path": "", "summary": "" }],
  "tests": { "runner": "", "result": "passed" | "failed" }
}`,
  'agent-output': `{
  "status": "success" | "failure" | "blocked" | "needs_clarification",
  "confidence": 0.0,
  "warnings": [],
  "artifacts": [],
  "next_actions": []
}`,
  'scorecard-record': `{
  "id": "",
  "taskId": "",
  "agent": "",
  "contractVersion": "",
  "criteria": [],
  "weightedScore": 0.0,
  "verdict": "PASS" | "REVISE" | "REJECT",
  "findings": [],
  "createdAt": ""
}`,
};

const KNOWLEDGE_KEYS_BY_ROLE: Record<string, readonly string[]> = {
  'task-coach': ['productName', 'domains', 'requirements', 'risks'],
  architect: ['productName', 'domains', 'decisions', 'requirements', 'risks'],
  tester: ['productName', 'requirements', 'risks'],
  implementer: ['productName', 'decisions', 'requirements'],
  reviewer: ['productName', 'decisions', 'requirements', 'risks'],
  docs: ['productName', 'decisions', 'requirements'],
  'contract-builder': ['productName', 'domains', 'decisions', 'requirements'],
  'complexity-auditor': ['productName', 'decisions', 'requirements', 'risks'],
  orchestrator: ['productName', 'domains', 'decisions', 'requirements', 'risks'],
  'repo-explorer': ['productName', 'domains', 'requirements'],
};

const PRODUCT_GRAPH_KNOWLEDGE_KEYS = new Set([
  'productName',
  'domains',
  'decisions',
  'risks',
  'requirements',
  'nodeCount',
]);

function buildSystemLayer(): string {
  return [
    'You are a CodeConductor agent operating under CCEP-1.',
    'Rules:',
    '- Do not invent context.',
    '- If critical data is missing, return questions in structured output.',
    '- Produce valid JSON only — no free-form prose as the final answer.',
    '- Match the output schema exactly.',
  ].join('\n');
}

function buildAgentLayer(role: string, phase: string, outputSchema: string): string {
  const label = ROLE_LABELS[role] ?? role;
  let instruction: string;
  if (role === 'task-coach' && phase === 'intake') {
    instruction = `You are the Planner / ${label} of CodeConductor.\nConvert product intent into a structured plan without writing code.`;
  } else if (role === 'implementer') {
    instruction = `You are the ${label}.\nExecute only your assigned phase: ${phase}.\nWrite the minimal diff.`;
  } else {
    instruction = `You are the ${label}.\nExecute only your assigned phase: ${phase}.`;
  }
  return `${instruction}\nReturn ${outputSchema} JSON only.`;
}

function buildTaskLayer(context: ExecutionContextInput, phase: string): string {
  if (context.envelope.command === 'openspec') {
    return JSON.stringify(buildOpenspecPhaseContext(context, phase).task, null, 2);
  }
  return JSON.stringify(
    {
      command: context.envelope.command,
      intent: context.intent,
      phase,
      project: context.project.name,
    },
    null,
    2,
  );
}

function scopeKnowledgeForRole(
  knowledge: Record<string, unknown>,
  role: string,
): Record<string, unknown> {
  const keys = KNOWLEDGE_KEYS_BY_ROLE[role];
  if (!keys) return knowledge;
  if (Object.keys(knowledge).some((key) => !PRODUCT_GRAPH_KNOWLEDGE_KEYS.has(key))) {
    return knowledge;
  }

  return Object.fromEntries(
    keys
      .filter((key) => knowledge[key] !== undefined)
      .map((key) => [key, knowledge[key]]),
  );
}

export function compilePrompt(options: {
  readonly role: string;
  readonly phase: string;
  readonly context: ExecutionContextInput;
  readonly promptVersion: string;
}): CompiledPrompt {
  const { role, phase, context, promptVersion } = options;
  const phaseDef = context.profile.phases.find((p) => p.id === phase);
  const configuredSchemaName =
    phaseDef?.outputSchema ?? context.outputSchema ?? 'agent-output';
  const schemaName = resolveOutputSchemaName(configuredSchemaName, role);
  const schemaBody = OUTPUT_SCHEMAS[schemaName] ?? OUTPUT_SCHEMAS['agent-output'];
  const knowledge = context.envelope.command === 'openspec'
    ? buildOpenspecPhaseContext(context, phase).knowledge
    : scopeKnowledgeForRole(context.knowledge, role);

  const layers: PromptLayer[] = [
    { name: 'system', content: buildSystemLayer() },
    { name: 'agent', content: buildAgentLayer(role, phase, schemaName) },
    {
      name: 'policies',
      content: JSON.stringify({ ...context.policies, promptVersion }, null, 2),
    },
    { name: 'knowledge', content: JSON.stringify(knowledge, null, 2) },
    { name: 'ast', content: JSON.stringify(context.ast, null, 2) },
    { name: 'task', content: buildTaskLayer(context, phase) },
    {
      name: 'output_schema',
      content: `Output schema (${schemaName}):\n${schemaBody}`,
    },
  ];

  const prompt = layers.map((layer) => `## ${layer.name}\n${layer.content}`).join('\n\n');

  return { layers, prompt, outputSchema: schemaName };
}
