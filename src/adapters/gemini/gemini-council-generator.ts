import type { GeneratedFile } from '../../core/generation/generated-file';
import { generateAgentContent } from '../../domain/council/council-agent';
import type { CouncilSpec } from '../../domain/council/council-spec';

/**
 * Generate Gemini CLI council files.
 *
 * Gemini shares the SKILL.md format with every other target, so the skill
 * and per-agent role files are plain Markdown under `.gemini/`. The workflow
 * itself is a native Gemini CLI TOML command (`.gemini/commands/cc/council.toml`)
 * — Gemini does not load Markdown slash commands, only TOML ones — instead of
 * routing council into `.agents/` like the agy installer does.
 */
export function generateGeminiFiles(spec: CouncilSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: '.gemini/skills/council/SKILL.md',
    content: generateCouncilSkill(spec),
    overwrite: false,
  });

  for (const agent of spec.agents) {
    files.push({
      path: `.gemini/agents/council-${agent.id}.md`,
      content: generateAgentContent(agent),
      overwrite: false,
    });
  }

  files.push({
    path: '.gemini/commands/cc/council.toml',
    content: generateCouncilToml(spec),
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

function generateCouncilToml(spec: CouncilSpec): string {
  const prompt = tomlEscapePrompt(`## Step 1 — Deliberation & Specification (SDD)

Invoke the council skill to analyze the request before writing any code. The council must act as a steering committee involving task-coach (Product), architect, and devil.

The council must:
1. Clarify the prompt and define the absolute minimum scope (Simplicity Gate).
2. Explicitly document all assumptions and resolve ambiguities (Think Before Coding).
3. Draft a Task Card & Technical Plan (The Specification).

STOP here. Show the agreed Task Card & Technical Plan and wait for human confirmation before continuing.

---

## Step 2 — Test Definition (TDD)

Invoke tester with the approved Task Card & Technical Plan. Write failing tests based on the Acceptance Criteria, then confirm they fail (Red state).

---

## Step 3 — Surgical Implementation

Invoke implementer with the failing tests and the Technical Plan. Write the minimal code required to pass the tests, touching ONLY the files specified in the Technical Plan. Loop implementer -> tester until all tests pass (Green state).

---

## Step 4 — Multi-Perspective Council Review

Invoke the council skill on the generated diff. If ANY agent votes CRITICAL, the Review Report status is BLOCKED and work returns to Step 3. If APPROVED (no CRITICAL findings), deliver the final Council Verdict and the diff summary.

---

## Completion

Deliver the complete Council Verdict. The feature is only complete when tests pass and the council explicitly approves the implementation.

Task request: {{args}}`);

  return `description = ${JSON.stringify(spec.description)}

prompt = """
${prompt}
"""
`;
}

function tomlEscapePrompt(prompt: string): string {
  return prompt.replace(/\\/g, '\\\\').replace(/"""/g, "'''");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
