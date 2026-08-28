import type { ExecutionContextInput } from '../../validation/schemas';

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
  'agent-output': '{ "status": "success", "artifacts": [], "next_actions": [] }',
};

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

function buildAgentLayer(role: string, phase: string): string {
  const label = ROLE_LABELS[role] ?? role;
  if (role === 'task-coach' && phase === 'intake') {
    return `You are the Planner / ${label} of CodeConductor.\nConvert product intent into a structured plan without writing code.`;
  }
  if (role === 'implementer') {
    return `You are the ${label}.\nExecute only your assigned phase: ${phase}.\nWrite the minimal diff. Return implementer-output JSON only.`;
  }
  if (role === 'reviewer') {
    return `You are the ${label}.\nExecute only your assigned phase: ${phase}.\nReturn review-report JSON only.`;
  }
  return `You are the ${label}.\nExecute only your assigned phase: ${phase}.`;
}

function buildTaskLayer(context: ExecutionContextInput, phase: string): string {
  return JSON.stringify(
    {
      command: context.envelope.command,
      intent: context.intent,
      phase,
      userRequest: context.envelope.userRequest,
      project: context.project.name,
    },
    null,
    2,
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
  const schemaName =
    phaseDef?.outputSchema ?? context.outputSchema ?? 'agent-output';
  const schemaBody = OUTPUT_SCHEMAS[schemaName] ?? OUTPUT_SCHEMAS['agent-output'];

  const layers: PromptLayer[] = [
    { name: 'system', content: buildSystemLayer() },
    { name: 'agent', content: buildAgentLayer(role, phase) },
    {
      name: 'policies',
      content: JSON.stringify({ ...context.policies, promptVersion }, null, 2),
    },
    { name: 'knowledge', content: JSON.stringify(context.knowledge, null, 2) },
    { name: 'ast', content: JSON.stringify(context.ast, null, 2) },
    { name: 'task', content: buildTaskLayer(context, phase) },
    {
      name: 'output_schema',
      content: `Output schema (${schemaName}):\n${schemaBody}`,
    },
  ];

  const prompt = layers.map((layer) => `## ${layer.name}\n${layer.content}`).join('\n\n');

  return { layers, prompt };
}
