/**
 * Compaction Hook — TDD history compaction after test pass.
 *
 * Clears RED/GREEN iteration history and passes only a summary to the next
 * phase. Creates history.jsonl if history mode is enabled and the file doesn't
 * exist.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompactionResult {
  /** Whether compaction was performed. */
  readonly compacted: boolean;
  /** Number of entries removed. */
  readonly entriesRemoved: number;
  /** The summary string passed to the next phase. */
  readonly summary: string;
  /** Path to history.jsonl if it exists. */
  readonly historyPath: string | undefined;
}

export interface HistoryEntry {
  readonly taskId: string;
  readonly phase: string;
  readonly iteration: number;
  readonly timestamp: string;
  readonly summary: string;
  readonly errors: readonly string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HISTORY_FILE = 'history.jsonl';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compact TDD history after tests pass.
 *
 * Reads existing history.jsonl, removes RED/GREEN iteration entries for the
 * given taskId, writes back only the summary entry, and returns the summary
 * for re-injection.
 *
 * If history.jsonl doesn't exist and history mode is implied (file path given),
 * creates it automatically.
 *
 * @param projectRoot - Root directory of the project.
 * @param taskId - The task ID whose history should be compacted.
 * @param summaryOverride - Optional summary to use instead of auto-generated.
 * @returns CompactionResult with stats and summary.
 */
export async function compactAfterTestPass(
  projectRoot: string,
  taskId: string,
  summaryOverride?: string,
): Promise<CompactionResult> {
  const dir = resolve(projectRoot, '.codeconductor');
  const historyPath = resolve(dir, HISTORY_FILE);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Check if history file exists
  let exists = false;
  try {
    await access(historyPath);
    exists = true;
  } catch {
    // File doesn't exist
  }

  if (!exists) {
    // Create empty history file
    await writeFile(historyPath, '', 'utf-8');
    return {
      compacted: false,
      entriesRemoved: 0,
      summary: summaryOverride ?? `Task ${taskId}: tests passed, no prior history.`,
      historyPath,
    };
  }

  // Read existing history
  const content = await readFile(historyPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim() !== '');

  // Parse entries
  const entries: HistoryEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as HistoryEntry);
    } catch {
      // Skip malformed lines
    }
  }

  // Separate: entries for this task vs others
  const otherEntries = entries.filter((e) => e.taskId !== taskId);
  const taskEntries = entries.filter((e) => e.taskId === taskId);

  if (taskEntries.length === 0) {
    // No entries to compact
    return {
      compacted: false,
      entriesRemoved: 0,
      summary: summaryOverride ?? `Task ${taskId}: tests passed, no prior history.`,
      historyPath,
    };
  }

  // Build summary from compacted entries
  const summary =
    summaryOverride ??
    `Task ${taskId}: compacted ${taskEntries.length} iteration(s) after test pass.`;

  // Create summary entry
  const summaryEntry: HistoryEntry = {
    taskId,
    phase: 'compacted',
    iteration: 0,
    timestamp: new Date().toISOString(),
    summary,
    errors: [],
  };

  // Write back: other entries + summary entry
  const outputEntries = [...otherEntries, summaryEntry];
  const jsonl = outputEntries.map((e) => JSON.stringify(e)).join('\n');
  await writeFile(historyPath, jsonl + (jsonl ? '\n' : ''), 'utf-8');

  return {
    compacted: true,
    entriesRemoved: taskEntries.length,
    summary,
    historyPath,
  };
}
