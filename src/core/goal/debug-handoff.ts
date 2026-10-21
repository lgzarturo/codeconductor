/**
 * Fresh-perspective debug handoff — structured, bounded context package for
 * a debugging agent. Carries breaker state, changed files/symbols and recent
 * history only; never conversation history, so the debugger cannot inherit
 * the failed attempts' confirmation bias.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { detectChanges } from '../impact/detect-changes';
import { loadGoal } from './goal-state';
import { err, ok, type Result } from '../../utils/result';

const MAX_SYMBOLS = 30;
const MAX_HISTORY = 5;

interface HistoryEntry {
  readonly taskId?: unknown;
  readonly phase?: unknown;
  readonly iteration?: unknown;
  readonly timestamp?: unknown;
  readonly summary?: unknown;
  readonly errors?: unknown;
}

async function recentHistory(projectRoot: string, taskId: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(resolve(projectRoot, '.codeconductor/history.jsonl'), 'utf-8');
  } catch {
    return [];
  }
  const entries: HistoryEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as HistoryEntry);
    } catch {
      continue;
    }
  }
  return entries
    .filter((entry) => entry.taskId === taskId)
    .slice(-MAX_HISTORY)
    .map((entry) => {
      const errorCount = Array.isArray(entry.errors) ? entry.errors.length : 0;
      return `- ${String(entry.phase ?? '?')} #${String(entry.iteration ?? '?')} @${String(entry.timestamp ?? '?')}: ${String(entry.summary ?? '(no summary)')}${errorCount > 0 ? ` [errors: ${errorCount}]` : ''}`;
    });
}

export interface DebugHandoff {
  readonly taskId: string;
  readonly markdown: string;
}

export async function buildDebugHandoff(
  projectRoot: string,
  taskId: string,
): Promise<Result<DebugHandoff, Error>> {
  const goal = await loadGoal(projectRoot);
  if (!goal.success) return goal;
  const task = goal.data.tasks.find((t) => t.id === taskId);
  if (!task) {
    return err(new Error(`Task "${taskId}" not found in goal graph`));
  }

  const changes = await detectChanges(projectRoot);
  const history = await recentHistory(projectRoot, taskId);
  const symbols = changes.affectedSymbols.slice(0, MAX_SYMBOLS);
  const hidden = changes.affectedSymbols.length - symbols.length;

  const lines = [
    '# Debug handoff',
    '',
    '> Fresh context package — no conversation history included. Diagnose root cause from this package only.',
    '',
    `Task: ${task.id} — ${task.title}`,
    `Status: ${task.status}${task.frozen === true ? ' (frozen)' : ''} · failures: ${task.consecutive_failures ?? 0}`,
    `Blocked reason: ${task.blocked_reason ?? 'none'}`,
    `Acceptance: ${(task.acceptance_criteria ?? []).join('; ') || 'none'}`,
    '',
    `## Changed files (${changes.affectedFiles.length})`,
    ...(changes.affectedFiles.length > 0 ? changes.affectedFiles.map((f) => `- ${f}`) : ['- none']),
    '',
    `## Changed symbols (${changes.affectedSymbols.length})`,
    ...(symbols.length > 0
      ? symbols.map((s) => `- ${s.file}:${s.startLine}-${s.endLine} ${s.name} (${s.kind})`)
      : ['- none']),
    ...(hidden > 0 ? [`- … +${hidden} more`] : []),
    '',
    '## Recent history (bounded)',
    ...(history.length > 0 ? history : ['- no history recorded']),
  ];
  return ok({ taskId, markdown: `${lines.join('\n')}\n` });
}

export async function writeDebugHandoff(
  projectRoot: string,
  taskId: string,
): Promise<Result<{ path: string }, Error>> {
  const handoff = await buildDebugHandoff(projectRoot, taskId);
  if (!handoff.success) return handoff;
  try {
    const safeId = taskId.replace(/[^A-Za-z0-9_-]/g, '_');
    const dir = resolve(projectRoot, '.codeconductor');
    await mkdir(dir, { recursive: true });
    const path = resolve(dir, `debug-delegation-${safeId}.md`);
    await writeFile(path, handoff.data.markdown, 'utf-8');
    return ok({ path });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
