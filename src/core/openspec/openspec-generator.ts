import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BacklogItemInput, OpenspecTaskCardInput } from '../../validation/schemas';
import { buildChangeSlug } from './backlog-planner';

function proposalContent(item: BacklogItemInput): string {
  return `# Proposal: ${item.title}

## Why

${item.description}

${item.businessValue ? `**Business value:** ${item.businessValue}` : ''}

## What Changes

- ${item.scope}

## Capabilities

- **New Capabilities:** (to be refined in design phase)
- **Modified Capabilities:** (to be refined in design phase)

## Impact

${item.risks ? `Risks: ${item.risks}` : 'See design.md for technical impact.'}

**Out of scope:** ${item.outOfScope || 'None specified.'}
`;
}

function designPlaceholder(item: BacklogItemInput): string {
  return `# Design: ${item.title}

## Approach

(To be completed in design phase.)

## Files Affected

${item.scope}

## Acceptance Criteria

${item.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}
`;
}

function tasksContent(cards: OpenspecTaskCardInput[]): string {
  const implCards = cards.filter((c) => c.phase === 'implement' || c.phase === 'test');
  const lines = ['# Implementation Tasks', ''];
  for (const card of implCards) {
    const checked = card.status === 'done' ? 'x' : ' ';
    lines.push(`- [${checked}] ${card.title} (${card.id})`);
  }
  if (implCards.length === 0) {
    lines.push('- [ ] Implementation tasks (generated after plan)');
  }
  return lines.join('\n');
}

/**
 * Generate OpenSpec-compatible change folder for a backlog item.
 */
export async function generateOpenspecChange(
  projectRoot: string,
  item: BacklogItemInput,
  taskCards: OpenspecTaskCardInput[]
): Promise<string> {
  const slug = buildChangeSlug(item);
  const changeDir = resolve(projectRoot, 'openspec', 'changes', slug);
  await mkdir(resolve(changeDir, 'specs'), { recursive: true });

  await writeFile(resolve(changeDir, 'proposal.md'), proposalContent(item), 'utf-8');
  await writeFile(resolve(changeDir, 'design.md'), designPlaceholder(item), 'utf-8');
  await writeFile(resolve(changeDir, 'tasks.md'), tasksContent(taskCards), 'utf-8');

  const specStub = `# Delta Spec: ${item.title}

## ADDED Requirements

${item.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}
`;
  await writeFile(resolve(changeDir, 'specs', 'delta.md'), specStub, 'utf-8');

  return `openspec/changes/${slug}`;
}

/**
 * Write openspec/config.yaml stub if missing.
 */
export async function ensureOpenspecConfig(projectRoot: string): Promise<void> {
  const configPath = resolve(projectRoot, 'openspec', 'config.yaml');
  try {
    const { access } = await import('node:fs/promises');
    await access(configPath);
  } catch {
    await mkdir(resolve(projectRoot, 'openspec'), { recursive: true });
    const stub = `# OpenSpec project config (CodeConductor native compatible)
schema: spec-driven
`;
    await writeFile(configPath, stub, 'utf-8');
  }
}
