import type { GeneratedFile } from '../../core/generation/generated-file';
import { generateAgentContent } from '../../domain/council/council-agent';
import type { CouncilSpec } from '../../domain/council/council-spec';

/**
 * Generate Antigravity (agy) council files
 */
export function generateAgyFiles(spec: CouncilSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Generate council skill
  files.push({
    path: '.agents/skills/council/SKILL.md',
    content: generateCouncilSkill(spec),
    overwrite: false,
  });

  // Generate individual agents
  for (const agent of spec.agents) {
    files.push({
      path: `.agents/agents/council-${agent.id}.md`,
      content: generateAgyAgentContent(agent),
      overwrite: false,
    });
  }

  // Generate council workflow (slash command)
  files.push({
    path: '.agents/workflows/cc-council.md',
    content: generateCouncilWorkflow(spec),
    overwrite: false,
  });

  return files;
}

function generateCouncilSkill(spec: CouncilSpec): string {
  return `---
name: council
description: ${yamlString(spec.description)}
---

# Council Skill

## Version
${spec.version}

## Agents
${spec.agents.map((a) => `- ${a.role} (${a.id}): ${a.focus.join(', ')}`).join('\n')}

## Usage
Use the council agents to get multi-perspective analysis on code changes, architecture decisions, and security reviews.

## Instructions
Coordinate with the council agents and synthesize their perspectives into the configured output contract.

## Context
${spec.outputContract}
`;
}

function generateAgyAgentContent(agent: CouncilSpec['agents'][number]): string {
  return `---
description: ${yamlString(`${agent.role} council agent. Focus: ${agent.focus.join(', ')}. Context: ${agent.context}. Model hint: ${agent.modelHint}.`)}
mode: subagent
permission:
${generatePermissionBlock(agent.context)}
---

${generateAgentContent(agent)}`;
}

function generatePermissionBlock(context: CouncilSpec['agents'][number]['context']): string {
  if (context === 'repo-readonly') {
    return `  read: allow
  edit: deny
  bash: deny
  glob: allow
  grep: allow
  webfetch: deny
  websearch: deny`;
  }

  return `  read: deny
  edit: deny
  bash: deny
  glob: deny
  grep: deny
  webfetch: deny
  websearch: deny`;
}

function generateCouncilWorkflow(spec: CouncilSpec): string {
  return `---
name: cc-council
description: ${yamlString(spec.description)}
---

# Council-Driven Workflow

Task request: $ARGUMENTS

## Step 1 — Deliberation & Specification (SDD)

Invoke the \`council\` skill to analyze the request before writing any code. The council must act as a steering committee involving \`task-coach\` (Product), \`architect\`, and \`devil\`.

The council must:
1. Clarify the prompt and define the absolute minimum scope (Simplicity Gate).
2. Explicitly document all assumptions and resolve ambiguities (Think Before Coding).
3. Draft a Task Card & Technical Plan (The Specification).

**STOP here. Show the agreed Task Card & Technical Plan and wait for human confirmation before continuing.**

---

## Step 2 — Test Definition (TDD)

Invoke \`tester\` with the approved Task Card & Technical Plan.

tester must:
1. Write failing tests based on the Acceptance Criteria defined in the Task Card.
2. Confirm the tests fail as expected (Red state).

**Goal-Driven Execution (Karpathy)**: Do not proceed until verifiable tests are written and fail for the correct reasons.

---

## Step 3 — Surgical Implementation

Invoke \`implementer\` with the failing tests and the Technical Plan.

implementer must:
1. Write the minimal code required to pass the tests.
2. Touch ONLY the files specified in the Technical Plan (Surgical Changes).
3. NOT refactor adjacent code, change existing styles, or build speculative features.
4. Run the tests. Loop \`implementer\` -> \`tester\` until all tests pass (Green state).

---

## Step 4 — Multi-Perspective Council Review

Invoke the \`council\` skill on the generated diff to perform the final review phase.

The council will evaluate the diff against the 6 axes (Architecture, Security, Product, Delivery, DataOps, Devil).

If ANY agent votes CRITICAL (especially due to over-engineering, scope creep, or missing the verifiable goals):
- The Review Report status is **BLOCKED**.
- Return to Step 3 with the feedback.

If APPROVED (no CRITICAL findings):
- Deliver the final Council Verdict and the diff summary.

---

## Completion

Deliver the complete Council Verdict. The feature is only complete when tests pass and the council explicitly approves the implementation according to the specification.
`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
