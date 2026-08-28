import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  OpenspecStateSchema,
  type BacklogItemInput,
  type BacklogStatusInput,
  type OpenspecStateInput,
  type OpenspecTaskCardInput,
  type OpenspecTaskCardStatusInput,
} from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';

const STATE_FILE = '.codeconductor/openspec-state.json';

const ALLOWED_TRANSITIONS: Record<BacklogStatusInput, BacklogStatusInput[]> = {
  TODO: ['READY'],
  READY: ['PLANNED', 'BLOCKED'],
  PLANNED: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['REVIEW', 'BLOCKED'],
  BLOCKED: ['READY'],
  REVIEW: ['DONE', 'IN_PROGRESS'],
  DONE: [],
};

/**
 * Validate backlog item status transition.
 */
export function canTransition(from: BacklogStatusInput, to: BacklogStatusInput): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply a validated backlog status transition in markdown.
 * Same-status updates are idempotent and may still rewrite Progress.
 */
export function applyBacklogTransition(
  content: string,
  itemId: string,
  from: BacklogStatusInput,
  to: BacklogStatusInput,
  progress?: number,
): Result<string, Error> {
  if (from === to) {
    if (progress === undefined) return ok(content);
    return ok(updateBacklogItemInMarkdown(content, itemId, { progress }));
  }
  if (!canTransition(from, to)) {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    return err(
      new Error(
        `Illegal backlog transition for ${itemId}: ${from} → ${to}. ` +
          `Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none'}.`,
      ),
    );
  }
  return ok(updateBacklogItemInMarkdown(content, itemId, { status: to, progress }));
}

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, path);
}

/**
 * Load openspec state from disk.
 */
export async function loadOpenspecState(
  projectRoot: string
): Promise<Result<OpenspecStateInput, Error>> {
  try {
    const filePath = resolve(projectRoot, STATE_FILE);
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return ok(OpenspecStateSchema.parse(data));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok({
        version: 1,
        taskCards: [],
        changePaths: {},
        itemSnapshots: {},
      });
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Write openspec state to disk.
 */
export async function writeOpenspecState(
  projectRoot: string,
  state: OpenspecStateInput
): Promise<Result<void, Error>> {
  try {
    const dir = resolve(projectRoot, '.codeconductor');
    await mkdir(dir, { recursive: true });
    const validated = OpenspecStateSchema.parse(state);
    await writeFileAtomic(
      resolve(dir, 'openspec-state.json'),
      JSON.stringify(validated, null, 2),
    );
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Update task card status in state.
 */
export function setTaskCardStatus(
  state: OpenspecStateInput,
  cardId: string,
  status: OpenspecTaskCardStatusInput
): OpenspecStateInput {
  const taskCards = state.taskCards.map((c) =>
    c.id === cardId ? { ...c, status } : c
  );
  return { ...state, taskCards };
}

/**
 * Get next pending task card for active item.
 */
export function getNextTaskCard(state: OpenspecStateInput): OpenspecTaskCardInput | null {
  const done = new Set(state.taskCards.filter((c) => c.status === 'done').map((c) => c.id));
  for (const card of state.taskCards) {
    if (card.status === 'done' || card.status === 'blocked') continue;
    const depsOk = card.dependsOn.every((d) => done.has(d));
    if (depsOk && card.status === 'pending') return card;
  }
  return null;
}

/**
 * Hash backlog file content for scan diff detection.
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function serializeItemSnapshot(item: BacklogItemInput): string {
  return JSON.stringify({
    status: item.status,
    progress: item.progress,
    title: item.title,
    description: item.description,
    scope: item.scope,
    type: item.type,
    priority: item.priority,
    acceptanceCriteria: item.acceptanceCriteria,
  });
}

/**
 * Update item status/progress in BACKLOG.md content string.
 */
export function updateBacklogItemInMarkdown(
  content: string,
  itemId: string,
  updates: { status?: BacklogStatusInput; progress?: number }
): string {
  const lines = content.split('\n');
  let inTargetItem = false;
  const idPattern = new RegExp(`^###\\s+.*${escapeRegExp(itemId)}\\b`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^###\s+/)) {
      inTargetItem = idPattern.test(line);
      continue;
    }
    if (!inTargetItem) continue;

    if (updates.status && line.match(/^-\s+Status:/i)) {
      lines[i] = `- Status: ${updates.status}`;
    }
    if (updates.progress !== undefined && line.match(/^-\s+Progress:/i)) {
      lines[i] = `- Progress: ${updates.progress}%`;
    }
  }

  return lines.join('\n');
}

/**
 * Move completed item to Archive section in BACKLOG.md.
 */
export function archiveItemInMarkdown(content: string, itemId: string): string {
  const lines = content.split('\n');
  const itemStart = lines.findIndex((l) =>
    l.match(new RegExp(`^###\\s+.*${escapeRegExp(itemId)}\\b`, 'i')),
  );
  if (itemStart < 0) return content;

  let itemEnd = lines.length;
  for (let i = itemStart + 1; i < lines.length; i++) {
    if (lines[i].match(/^###\s+/) || lines[i].match(/^##\s+Archive/i)) {
      itemEnd = i;
      break;
    }
  }

  const block = lines.slice(itemStart, itemEnd);
  const statusLine = block.findIndex((l) => l.match(/^-\s+Status:/i));
  if (statusLine >= 0) block[statusLine] = '- Status: DONE';

  const progressLine = block.findIndex((l) => l.match(/^-\s+Progress:/i));
  if (progressLine >= 0) block[progressLine] = '- Progress: 100%';

  const withoutItem = [...lines.slice(0, itemStart), ...lines.slice(itemEnd)];

  const archiveIdx = withoutItem.findIndex((l) => /^##\s+Archive/i.test(l));
  if (archiveIdx < 0) {
    withoutItem.push('', '## Archive', ...block);
  } else {
    withoutItem.splice(archiveIdx + 1, 0, ...block);
  }

  // Remove duplicate from Items section (already removed by slice)
  return withoutItem.join('\n');
}
