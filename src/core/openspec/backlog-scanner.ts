import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BacklogDocumentInput, BacklogItemInput } from '../../validation/schemas';
import { parseBacklogMarkdown, BACKLOG_FILENAME } from './backlog-parser';
import { hashContent, serializeItemSnapshot } from './openspec-state';
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
    snap[item.id] = serializeItemSnapshot(item);
  }
  return snap;
}

/**
 * Check whether BACKLOG.md differs from git HEAD. Falls back to true when
 * git is unavailable so callers treat the file as changed.
 */
export function checkBacklogFileChanged(projectRoot: string): boolean {
  try {
    const diff = execFileSync('git', ['diff', '--name-only', '--', BACKLOG_FILENAME], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return diff.trim().length > 0;
  } catch {
    return true;
  }
}

/**
 * Pure item-level diff of already-read backlog content vs previous snapshot.
 * Takes the parsed document so callers that already parsed pay no second parse.
 */
export function computeScanDiff(
  content: string,
  doc: BacklogDocumentInput,
  previousSnapshot: Record<string, string> = {},
  fileChanged = true
): ScanDiff {
  const hash = hashContent(content);
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

    return {
      fileChanged,
      contentHash: hash,
      newItems,
      modifiedItems,
      closedItems,
    };
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
    const parseResult = parseBacklogMarkdown(content);
    if (!parseResult.success) return parseResult;
    return ok(
      computeScanDiff(content, parseResult.data, previousSnapshot, checkBacklogFileChanged(projectRoot))
    );
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
