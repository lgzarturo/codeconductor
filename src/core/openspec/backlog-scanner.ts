import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BacklogItemInput } from '../../validation/schemas';
import { parseBacklogMarkdown, BACKLOG_FILENAME } from './backlog-parser';
import { hashContent } from './openspec-state';
import { err, ok, type Result } from '../../utils/result';

export interface ScanDiff {
  fileChanged: boolean;
  contentHash: string;
  newItems: string[];
  modifiedItems: string[];
  closedItems: string[];
}

function itemSnapshot(items: BacklogItemInput[]): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const item of items) {
    snap[item.id] = JSON.stringify({
      status: item.status,
      progress: item.progress,
      title: item.title,
    });
  }
  return snap;
}

/**
 * Scan BACKLOG.md for git changes and item-level diffs vs previous snapshot.
 */
export async function scanBacklog(
  projectRoot: string,
  previousSnapshot: Record<string, string> = {}
): Promise<Result<ScanDiff, Error>> {
  try {
    const filePath = resolve(projectRoot, BACKLOG_FILENAME);
    const content = await readFile(filePath, 'utf-8');
    const hash = hashContent(content);

    let fileChanged = true;
    try {
      const diff = execSync(`git diff --name-only -- ${BACKLOG_FILENAME}`, {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      fileChanged = diff.trim().length > 0;
    } catch {
      fileChanged = true;
    }

    const parseResult = parseBacklogMarkdown(content);
    if (!parseResult.success) return parseResult;

    const doc = parseResult.data;
    const current = itemSnapshot([...doc.items, ...doc.archive]);
    const newItems: string[] = [];
    const modifiedItems: string[] = [];
    const closedItems: string[] = [];

    for (const [id, snap] of Object.entries(current)) {
      if (!previousSnapshot[id]) {
        newItems.push(id);
      } else if (previousSnapshot[id] !== snap) {
        modifiedItems.push(id);
      }
    }

    for (const id of Object.keys(previousSnapshot)) {
      if (!current[id]) closedItems.push(id);
    }

    for (const item of doc.archive) {
      if (!closedItems.includes(item.id)) closedItems.push(item.id);
    }
    for (const item of doc.items) {
      if (item.status === 'DONE' && !closedItems.includes(item.id)) {
        closedItems.push(item.id);
      }
    }

    return ok({
      fileChanged,
      contentHash: hash,
      newItems,
      modifiedItems,
      closedItems,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Build snapshot map from parsed items for state persistence.
 */
export function buildItemSnapshot(
  items: BacklogItemInput[],
  archive: BacklogItemInput[]
): Record<string, string> {
  return itemSnapshot([...items, ...archive]);
}
