import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { BacklogItemInput, OpenspecTaskCardInput } from '../../validation/schemas';
import { buildChangeSlug } from './backlog-planner';
import { markUntrusted } from '../shared/untrusted-text';

export interface OpenspecTasksOptions {
  readonly tddRequired?: boolean;
  readonly acceptanceCriteria?: string[];
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function capabilitySlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'change';
}

function proposalContent(item: BacklogItemInput): string {
  return `# Proposal: ${item.title}

## Why

${markUntrusted('description', item.description)}

${item.businessValue ? `**Business value:**\n${markUntrusted('business-value', item.businessValue)}` : ''}

## What Changes

- ${markUntrusted('scope', item.scope)}

## Capabilities

- **New Capabilities:** ${item.title}
- **Modified Capabilities:** none

## Impact

${item.risks ? `Risks:\n${markUntrusted('risks', item.risks)}` : 'See design.md for technical impact.'}

**Out of scope:**
${markUntrusted('out-of-scope', item.outOfScope || 'None specified.')}
`;
}

function designContent(item: BacklogItemInput): string {
  return `# Design: ${item.title}

## Approach

Deliver "${item.title}" inside:

${markUntrusted('scope', item.scope)}

The architect MUST refine files and risks before implementation.

## Files Affected

${markUntrusted('scope', item.scope)}

## Acceptance Criteria

${item.acceptanceCriteria.map((c) => markUntrusted('acceptance-criterion', c)).join('\n\n')}

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected |
| --------- | ---------- | ---------------------------- |
| none | — | — |
`;
}

function specDelta(item: BacklogItemInput): string {
  const criteria =
    item.acceptanceCriteria.length > 0
      ? item.acceptanceCriteria
      : [`${item.title} is delivered`];
  const blocks = criteria.map((criterion, index) => {
    const n = pad3(index + 1);
    return `### Requirement: FR-${n} ${criterion}

The system MUST ${criterion}.

#### Scenario: SC-${n} ${criterion}

- GIVEN the relevant scoped behavior
- WHEN this change is applied
- THEN ${criterion}
`;
  });
  return `# Delta Spec: ${item.title}

## ADDED Requirements

${blocks.join('\n')}
`;
}

export function tasksMarkdown(
  cards: OpenspecTaskCardInput[],
  options: OpenspecTasksOptions = {},
): string {
  return tasksContent(cards, options);
}

/**
 * Set the checkbox of every `tasks.md` line that ends with `(<cardId>)`.
 * Edits made by agents to other lines are left untouched; a missing file is a
 * no-op (archive reports the missing artifact).
 */
export async function syncTaskCardCheckbox(
  projectRoot: string,
  changePath: string,
  cardId: string,
  done: boolean,
): Promise<void> {
  const file = resolve(projectRoot, changePath, 'tasks.md');
  let content: string;
  try {
    content = await readFile(file, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  const suffix = `(${cardId})`;
  const updated = content
    .split('\n')
    .map((line) =>
      /^\s*-\s*\[[ xX]\]/.test(line) && line.trimEnd().endsWith(suffix)
        ? line.replace(/\[[ xX]\]/, done ? '[x]' : '[ ]')
        : line,
    )
    .join('\n');
  if (updated !== content) await writeFile(file, updated, 'utf-8');
}

function tasksContent(
  cards: OpenspecTaskCardInput[],
  options: OpenspecTasksOptions = {},
): string {
  const criteria = options.acceptanceCriteria ?? [];
  // Tie each box to the card whose completion proves it, so `done` can tick it.
  const tag = (phase: OpenspecTaskCardInput['phase']): string => {
    const card = cards.find((c) => c.phase === phase);
    return card ? ` (${card.id})` : '';
  };
  const lines = [
    '# Implementation Tasks',
    '',
    '## Setup',
    '',
    `- [ ] Confirm scope and OpenSpec change folder${tag('discover')}`,
    '',
    '## Foundational',
    '',
    `- [ ] Read existing conventions in scope${tag('discover')}`,
    '',
    '## Requirements',
    '',
  ];

  if (criteria.length === 0) {
    lines.push(`- [ ] Implementation tasks (generated after plan)${tag('implement')}`);
  } else {
    for (const [index, criterion] of criteria.entries()) {
      const n = pad3(index + 1);
      if (options.tddRequired) {
        lines.push(`- [ ] Write failing test for FR-${n} (${criterion})${tag('test')}`);
      }
      lines.push(`- [ ] Implement FR-${n} (${criterion})${tag('implement')}`);
      lines.push(`- [ ] Verify SC-${n}${tag('review')}`);
    }
  }

  const phaseCards = cards.filter((c) => c.phase === 'implement' || c.phase === 'test');
  lines.push('', '## Phase cards', '');
  for (const card of phaseCards) {
    const checked = card.status === 'done' ? 'x' : ' ';
    lines.push(`- [${checked}] ${card.title} (${card.id})`);
  }
  if (phaseCards.length === 0) {
    lines.push('- [ ] Implementation tasks (generated after plan)');
  }

  lines.push(
    '',
    '## Polish',
    '',
    `- [ ] Run openspec analyze and scorecard create --from-diff${tag('review')}`,
  );
  return lines.join('\n');
}

/**
 * Generate OpenSpec-compatible change folder for a backlog item.
 */
export async function generateOpenspecChange(
  projectRoot: string,
  item: BacklogItemInput,
  taskCards: OpenspecTaskCardInput[],
  options: OpenspecTasksOptions = {},
): Promise<string> {
  const slug = buildChangeSlug(item);
  const changeDir = resolve(projectRoot, 'openspec', 'changes', slug);
  await mkdir(resolve(changeDir, 'specs'), { recursive: true });
  const taskOpts: OpenspecTasksOptions = {
    tddRequired: options.tddRequired,
    acceptanceCriteria: options.acceptanceCriteria ?? item.acceptanceCriteria,
  };

  await writeFile(resolve(changeDir, 'proposal.md'), proposalContent(item), 'utf-8');
  await writeFile(resolve(changeDir, 'design.md'), designContent(item), 'utf-8');
  await writeFile(resolve(changeDir, 'tasks.md'), tasksContent(taskCards, taskOpts), 'utf-8');
  const capability = capabilitySlug(item.title);
  await mkdir(resolve(changeDir, 'specs', capability), { recursive: true });
  await writeFile(resolve(changeDir, 'specs', capability, 'spec.md'), specDelta(item), 'utf-8');
  await writeFile(
    resolve(changeDir, 'change.yaml'),
    `version: 1\nbacklogId: ${item.id}\nprofile: standard\ncapabilities:\n  - ${capability}\n`,
    'utf-8',
  );

  return `openspec/changes/${slug}`;
}

export async function archiveChangeFolder(
  projectRoot: string,
  changePath: string,
): Promise<string> {
  const src = resolve(projectRoot, changePath);
  const slug = basename(changePath);
  const destDir = resolve(projectRoot, 'openspec', 'changes', 'archive');
  await mkdir(destDir, { recursive: true });
  const dest = resolve(destDir, slug);
  try {
    await access(dest);
    throw new Error(`Archive destination already exists: openspec/changes/archive/${slug}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Archive destination already exists')) {
      throw error;
    }
    // Destination is free; anything else from access means "not found".
  }
  await rename(src, dest);
  return `openspec/changes/archive/${slug}`;
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
