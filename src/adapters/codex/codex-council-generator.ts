import type { GeneratedFile } from '../../core/generation/generated-file';
import { checklistFor, yamlString } from '../../domain/council/council-agent';
import type { CouncilSpec } from '../../domain/council/council-spec';

/**
 * Generate Codex council files
 */
export function generateCodexFiles(spec: CouncilSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Generate config
  files.push({
    path: '.codex/config.toml',
    content: generateCodexConfig(spec),
    overwrite: false,
    mergeExisting: (existing) => mergeCodexCouncilConfig(existing, spec),
  });

  // Generate agents as TOML
  for (const agent of spec.agents) {
    files.push({
      path: `.codex/agents/council_${agent.id}.toml`,
      content: generateCodexAgent(agent),
      overwrite: true,
    });
  }

  // Generate skills
  files.push({
    path: '.codex/skills/council/SKILL.md',
    content: generateCodexSkill(spec),
    overwrite: true,
  });

  return files;
}

function agentTable(agent: CouncilSpec['agents'][number]): string {
  const focusAreas = agent.focus.join(', ');
  return `
[agents.${agent.id}]
description = "${agent.role} council agent. Focus: ${focusAreas}. Context: ${agent.context}. Model hint: ${agent.modelHint}."
config_file = "agents/council_${agent.id}.toml"
nickname_candidates = ["${agent.role}", "Council ${agent.role}"]`;
}

/**
 * Append council `[agents.<id>]` tables missing from an existing config.toml.
 * Existing content, including user edits and preset settings, is kept as-is.
 */
export function mergeCodexCouncilConfig(existing: string, spec: CouncilSpec): string {
  const missing = spec.agents.filter(
    (agent) => !existing.split('\n').some((line) => line.trim() === `[agents.${agent.id}]`)
  );
  if (missing.length === 0) return existing;
  return `${existing.trimEnd()}\n${missing.map(agentTable).join('\n')}\n`;
}

function generateCodexConfig(spec: CouncilSpec): string {
  const agentTables = spec.agents.map(agentTable).join('\n');

  return `# Codex Council Configuration

model = "gpt-6.1-sol"
model_reasoning_effort = "medium"

[project]
name = "council"
version = "${spec.version}"
${agentTables}
`;
}

function generateCodexAgent(agent: {
  id: string;
  role: string;
  context: string;
  modelHint: string;
  focus: readonly string[];
}): string {
  const focusAreas = agent.focus.join(', ');
  const checklist = checklistFor(agent.id).join('; ');
  return `model = "gpt-6.1-sol"
model_reasoning_effort = "medium"
name = "${agent.role}"
description = "${agent.role} council agent. Focus: ${focusAreas}. Context: ${agent.context}. Model hint: ${agent.modelHint}."
nickname_candidates = ["${agent.role}", "Council ${agent.role}"]
developer_instructions = "You are the ${agent.role} council agent. Your focus areas are: ${focusAreas}. Context: ${agent.context}. Apply ${agent.modelHint} reasoning to your analysis. Review checklist: ${checklist}. Categorize findings as CRITICAL (blocks the verdict), WARNING, or SUGGESTION."
`;
}

function generateCodexSkill(spec: CouncilSpec): string {
  return `---
name: council
description: ${yamlString(spec.description)}
version: ${spec.version}
---

## Agents
${spec.agents.map((a) => `- **${a.role}** (${a.id}): ${a.focus.join(', ')}`).join('\n')}

## Usage
Use the council agents to get multi-perspective analysis on code changes, architecture decisions, and security reviews.
Keep GPT-6.1 Sol at medium reasoning effort. Share a concise evidence summary
and relevant diff with only the necessary council roles. Reuse findings in the
final verdict instead of replaying the full transcript or repeating analysis.
`;
}
