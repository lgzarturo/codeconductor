import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadBacklog } from '../core/openspec/backlog-parser';
import { validateBacklog } from '../core/openspec/backlog-validator';
import { scanBacklog, buildItemSnapshot } from '../core/openspec/backlog-scanner';
import {
  planTaskCardsForItem,
  selectNextItem,
} from '../core/openspec/backlog-planner';
import {
  generateOpenspecChange,
  ensureOpenspecConfig,
  writeTasksMarkdown,
  archiveChangeFolder,
} from '../core/openspec/openspec-generator';
import {
  loadOpenspecState,
  writeOpenspecState,
  getNextTaskCard,
  setTaskCardStatus,
  applyBacklogTransition,
  archiveItemInMarkdown,
  writeFileAtomic,
  canTransition,
  serializeItemSnapshot,
} from '../core/openspec/openspec-state';
import { BACKLOG_FILENAME } from '../core/openspec/backlog-parser';
import { runLoopForProject, shouldRunAgentLoop } from '../core/loop/loop-engine';
import type { OutputMode } from '../utils/logger';
import type {
  BacklogItemInput,
  BacklogStatusInput,
  OpenspecStateInput,
  OpenspecTaskCardInput,
} from '../validation/schemas';

export interface OpenspecOptions {
  readonly subcommand: string;
  readonly itemId?: string;
  readonly reason?: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
}

const KNOWN_SUBCOMMANDS =
  'validate, scan, plan, status, next, start, done, block, archive';

/**
 * Openspec CLI — validate, scan, plan, status, next, start, done, block, archive
 */
export async function openspecCommand(
  options: OpenspecOptions
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, itemId, projectRoot, output, reason } = options;
  void output;

  switch (subcommand) {
    case 'validate':
      return handleValidate(projectRoot);
    case 'scan':
      return handleScan(projectRoot);
    case 'plan':
      return handlePlan(projectRoot, itemId);
    case 'status':
      return handleStatus(projectRoot);
    case 'next':
      return handleNext(projectRoot);
    case 'start':
      return handleStart(projectRoot, itemId);
    case 'done':
      return handleDone(projectRoot, itemId);
    case 'block':
      return handleBlock(projectRoot, itemId, reason);
    case 'archive':
      return handleArchive(projectRoot, itemId);
    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'openspec',
          errors: [
            `Unknown subcommand: ${subcommand}. Use: ${KNOWN_SUBCOMMANDS}`,
          ],
        },
      };
  }
}

function fail(
  command: string,
  errors: string[],
  extra: Record<string, unknown> = {},
): { code: number; data: unknown } {
  return {
    code: 1,
    data: { success: false, command, errors, ...extra },
  };
}

async function persistBacklog(projectRoot: string, content: string): Promise<void> {
  await writeFileAtomic(resolve(projectRoot, BACKLOG_FILENAME), content);
}

async function persistState(
  projectRoot: string,
  state: OpenspecStateInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const written = await writeOpenspecState(projectRoot, state);
  if (!written.success) {
    return { ok: false, error: written.error.message };
  }
  return { ok: true };
}

async function readBacklogMarkdown(projectRoot: string): Promise<string> {
  return readFile(resolve(projectRoot, BACKLOG_FILENAME), 'utf-8');
}

async function transitionItem(
  projectRoot: string,
  item: BacklogItemInput,
  to: BacklogStatusInput,
  progress?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const content = await readBacklogMarkdown(projectRoot);
  const next = applyBacklogTransition(content, item.id, item.status, to, progress);
  if (!next.success) {
    return { ok: false, error: next.error.message };
  }
  await persistBacklog(projectRoot, next.data);
  return { ok: true };
}

function findCard(
  state: OpenspecStateInput,
  cardId: string,
): OpenspecTaskCardInput | undefined {
  return state.taskCards.find((c) => c.id === cardId);
}

function itemCards(state: OpenspecStateInput, backlogId: string): OpenspecTaskCardInput[] {
  return state.taskCards.filter((c) => c.backlogId === backlogId);
}

async function handleValidate(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const loadResult = await loadBacklog(projectRoot);
  if (!loadResult.success) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'openspec validate',
        errors: [loadResult.error.message],
        recommendations: [
          'Create BACKLOG.md at project root using the CodeConductor template.',
        ],
      },
    };
  }

  const report = validateBacklog(loadResult.data);
  return {
    code: report.valid ? 0 : 1,
    data: {
      success: report.valid,
      command: 'openspec validate',
      valid: report.valid,
      errors: report.errors.map((e) => e.message),
      recommendations: report.recommendations,
      itemCount: loadResult.data.items.length,
      archiveCount: loadResult.data.archive.length,
    },
  };
}

async function handleScan(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const stateResult = await loadOpenspecState(projectRoot);
  const prevSnap =
    stateResult.success ? stateResult.data.itemSnapshots ?? {} : {};

  const scanResult = await scanBacklog(projectRoot, prevSnap);
  if (!scanResult.success) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'openspec scan',
        errors: [scanResult.error.message],
      },
    };
  }

  const loadResult = await loadBacklog(projectRoot);
  if (loadResult.success && stateResult.success) {
    const snapshots = buildItemSnapshot(loadResult.data.items, loadResult.data.archive);
    const state = {
      ...stateResult.data,
      lastScanHash: scanResult.data.contentHash,
      lastScanAt: new Date().toISOString(),
      itemSnapshots: snapshots,
    };
    const written = await persistState(projectRoot, state);
    if (!written.ok) {
      return fail('openspec scan', [written.error]);
    }
  }

  return {
    code: 0,
    data: {
      success: true,
      command: 'openspec scan',
      ...scanResult.data,
    },
  };
}

async function handlePlan(
  projectRoot: string,
  itemId?: string
): Promise<{ code: number; data?: unknown }> {
  const validateFirst = await handleValidate(projectRoot);
  if (validateFirst.code !== 0) return validateFirst;

  const loadResult = await loadBacklog(projectRoot);
  if (!loadResult.success) {
    return { code: 1, data: { success: false, errors: [loadResult.error.message] } };
  }

  const doc = loadResult.data;
  const item = selectNextItem(doc, itemId);
  if (!item) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'openspec plan',
        errors: [
          itemId
            ? `Item ${itemId} not found or not eligible`
            : 'No READY backlog item with satisfied dependencies',
        ],
      },
    };
  }

  const stateResult = await loadOpenspecState(projectRoot);
  const existingState = stateResult.success ? stateResult.data : {
    version: 1 as const,
    taskCards: [],
    changePaths: {},
    itemSnapshots: {},
  };

  if (item.status !== 'PLANNED' && !canTransition(item.status, 'PLANNED')) {
    return fail('openspec plan', [
      `Illegal backlog transition for ${item.id}: ${item.status} → PLANNED.`,
    ]);
  }

  const planned = planTaskCardsForItem(
    item,
    doc,
    existingState.taskCards,
    existingState.itemSnapshots?.[item.id],
  );
  const taskCards = planned.cards;
  await ensureOpenspecConfig(projectRoot);
  const changePath = await generateOpenspecChange(projectRoot, item, taskCards);

  const newState = {
    ...existingState,
    version: 1 as const,
    activeItemId: item.id,
    taskCards,
    changePaths: {
      ...existingState.changePaths,
      [item.id]: changePath,
    },
    itemSnapshots: {
      ...existingState.itemSnapshots,
      [item.id]: serializeItemSnapshot(item),
    },
  };
  const written = await persistState(projectRoot, newState);
  if (!written.ok) {
    return fail('openspec plan', [written.error]);
  }

  const content = await readBacklogMarkdown(projectRoot);
  const transition = applyBacklogTransition(
    content,
    item.id,
    item.status,
    'PLANNED',
    item.progress,
  );
  if (!transition.success) {
    return fail('openspec plan', [transition.error.message]);
  }
  await persistBacklog(projectRoot, transition.data);

  return {
    code: 0,
    data: {
      success: true,
      command: 'openspec plan',
      itemId: item.id,
      title: item.title,
      changePath,
      taskCards,
      invalidatedCards: planned.invalidatedCards,
      tddImpact: planned.tddImpact,
    },
  };
}

async function handleStatus(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const loadResult = await loadBacklog(projectRoot);
  const stateResult = await loadOpenspecState(projectRoot);

  const nextItem = loadResult.success ? selectNextItem(loadResult.data) : null;
  const state = stateResult.success ? stateResult.data : null;
  const pendingCards = state?.taskCards.filter((c) => c.status === 'pending').length ?? 0;
  const doneCards = state?.taskCards.filter((c) => c.status === 'done').length ?? 0;

  return {
    code: 0,
    data: {
      success: true,
      command: 'openspec status',
      activeItemId: state?.activeItemId,
      nextItemId: nextItem?.id,
      nextItemTitle: nextItem?.title,
      taskCardsPending: pendingCards,
      taskCardsDone: doneCards,
      changePaths: state?.changePaths ?? {},
    },
  };
}

async function handleNext(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const stateResult = await loadOpenspecState(projectRoot);
  if (!stateResult.success) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'openspec next',
        errors: [stateResult.error.message],
      },
    };
  }

  const next = getNextTaskCard(stateResult.data);
  if (!next) {
    return {
      code: 0,
      data: {
        success: true,
        command: 'openspec next',
        taskCard: null,
        message: 'No pending task cards. Run openspec plan first.',
      },
    };
  }

  let loop = undefined;
  if (shouldRunAgentLoop(undefined, next.agent, next.phase)) {
    loop = await runLoopForProject(projectRoot, {
      taskTitle: next.title,
      originalTask: next.prompt,
    });
  }

  return {
    code: loop && !loop.success ? 1 : 0,
    data: {
      success: !(loop && !loop.success),
      command: 'openspec next',
      taskCard: next,
      ...(loop ? { loop } : {}),
    },
  };
}

async function loadStateOrFail(
  projectRoot: string,
  command: string,
): Promise<
  | { ok: true; state: OpenspecStateInput }
  | { ok: false; response: { code: number; data?: unknown } }
> {
  const stateResult = await loadOpenspecState(projectRoot);
  if (!stateResult.success) {
    return { ok: false, response: fail(command, [stateResult.error.message]) };
  }
  return { ok: true, state: stateResult.data };
}

async function loadItemOrFail(
  projectRoot: string,
  itemId: string,
  command: string,
): Promise<
  | { ok: true; item: BacklogItemInput; reviewRequired: boolean }
  | { ok: false; response: { code: number; data?: unknown } }
> {
  const loadResult = await loadBacklog(projectRoot);
  if (!loadResult.success) {
    return { ok: false, response: fail(command, [loadResult.error.message]) };
  }
  const item =
    loadResult.data.items.find((i) => i.id === itemId) ??
    loadResult.data.archive.find((i) => i.id === itemId);
  if (!item) {
    return { ok: false, response: fail(command, [`Backlog item ${itemId} not found`]) };
  }
  return {
    ok: true,
    item,
    reviewRequired: loadResult.data.global.reviewRequired,
  };
}

async function handleStart(
  projectRoot: string,
  cardId?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec start';
  if (!cardId) {
    return fail(command, ['Missing card id. Usage: openspec start <cardId>']);
  }
  const loaded = await loadStateOrFail(projectRoot, command);
  if (!loaded.ok) return loaded.response;
  const card = findCard(loaded.state, cardId);
  if (!card) {
    return fail(command, [`Task card ${cardId} not found`]);
  }
  if (card.status !== 'pending' && card.status !== 'doing') {
    return fail(command, [`Card ${cardId} cannot start from status ${card.status}`]);
  }

  const itemLoaded = await loadItemOrFail(projectRoot, card.backlogId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  let state = loaded.state;
  if (card.status === 'pending') {
    state = setTaskCardStatus(state, cardId, 'doing');
    const written = await persistState(projectRoot, state);
    if (!written.ok) return fail(command, [written.error]);
  }

  const transition = await transitionItem(
    projectRoot,
    itemLoaded.item,
    'IN_PROGRESS',
    itemLoaded.item.progress,
  );
  if (!transition.ok) return fail(command, [transition.error]);

  return {
    code: 0,
    data: {
      success: true,
      command,
      cardId,
      cardStatus: 'doing',
      itemId: itemLoaded.item.id,
      itemStatus: 'IN_PROGRESS',
    },
  };
}

async function handleDone(
  projectRoot: string,
  cardId?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec done';
  if (!cardId) {
    return fail(command, ['Missing card id. Usage: openspec done <cardId>']);
  }
  const loaded = await loadStateOrFail(projectRoot, command);
  if (!loaded.ok) return loaded.response;
  const card = findCard(loaded.state, cardId);
  if (!card) {
    return fail(command, [`Task card ${cardId} not found`]);
  }
  if (card.status === 'done') {
    return {
      code: 0,
      data: { success: true, command, cardId, cardStatus: 'done', alreadyDone: true },
    };
  }
  if (card.status !== 'doing') {
    return fail(command, [`Card ${cardId} must be doing before done (got ${card.status})`]);
  }

  const itemLoaded = await loadItemOrFail(projectRoot, card.backlogId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  const state = setTaskCardStatus(loaded.state, cardId, 'done');
  const cards = itemCards(state, card.backlogId);
  const doneCount = cards.filter((c) => c.status === 'done').length;
  const progress = cards.length === 0 ? 0 : Math.round((doneCount / cards.length) * 100);
  const allDone = cards.length > 0 && doneCount === cards.length;

  const written = await persistState(projectRoot, state);
  if (!written.ok) return fail(command, [written.error]);

  const changePath = state.changePaths[card.backlogId];
  if (changePath) {
    await writeTasksMarkdown(projectRoot, changePath, cards);
  }

  const nextStatus: BacklogStatusInput = allDone ? 'REVIEW' : 'IN_PROGRESS';
  const transition = await transitionItem(projectRoot, itemLoaded.item, nextStatus, progress);
  if (!transition.ok) return fail(command, [transition.error]);

  return {
    code: 0,
    data: {
      success: true,
      command,
      cardId,
      cardStatus: 'done',
      itemId: itemLoaded.item.id,
      progress,
      itemStatus: nextStatus,
      allCardsDone: allDone,
    },
  };
}

async function handleBlock(
  projectRoot: string,
  cardId?: string,
  reason?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec block';
  if (!cardId) {
    return fail(command, ['Missing card id. Usage: openspec block <cardId> --reason <text>']);
  }
  if (!reason || !reason.trim()) {
    return fail(command, ['--reason is required']);
  }
  const loaded = await loadStateOrFail(projectRoot, command);
  if (!loaded.ok) return loaded.response;
  const card = findCard(loaded.state, cardId);
  if (!card) {
    return fail(command, [`Task card ${cardId} not found`]);
  }

  const itemLoaded = await loadItemOrFail(projectRoot, card.backlogId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  const state = setTaskCardStatus(loaded.state, cardId, 'blocked');
  const written = await persistState(projectRoot, state);
  if (!written.ok) return fail(command, [written.error]);

  const transition = await transitionItem(projectRoot, itemLoaded.item, 'BLOCKED');
  if (!transition.ok) return fail(command, [transition.error]);

  return {
    code: 0,
    data: {
      success: true,
      command,
      cardId,
      cardStatus: 'blocked',
      itemId: itemLoaded.item.id,
      itemStatus: 'BLOCKED',
      reason: reason.trim(),
    },
  };
}

async function handleArchive(
  projectRoot: string,
  itemId?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec archive';
  if (!itemId) {
    return fail(command, ['Missing item id. Usage: openspec archive <itemId>']);
  }
  const loaded = await loadStateOrFail(projectRoot, command);
  if (!loaded.ok) return loaded.response;
  const itemLoaded = await loadItemOrFail(projectRoot, itemId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  const cards = itemCards(loaded.state, itemId);
  if (cards.length === 0) {
    return fail(command, [`No task cards found for ${itemId}. Run openspec plan first.`]);
  }
  const unfinished = cards.filter((c) => c.status !== 'done');
  if (unfinished.length > 0) {
    return fail(command, [
      `Cannot archive ${itemId}: ${unfinished.length} card(s) are not done (${unfinished.map((c) => c.id).join(', ')})`,
    ]);
  }

  if (itemLoaded.reviewRequired) {
    const reviewCard = cards.find((c) => c.phase === 'review');
    if (!reviewCard || reviewCard.status !== 'done') {
      return fail(command, [
        `Cannot archive ${itemId}: global.reviewRequired needs the review phase card done`,
      ]);
    }
  }

  if (itemLoaded.item.status !== 'DONE') {
    const toDone = await transitionItem(projectRoot, itemLoaded.item, 'DONE', 100);
    if (!toDone.ok) return fail(command, [toDone.error]);
  }

  const content = await readBacklogMarkdown(projectRoot);
  const archived = archiveItemInMarkdown(content, itemId);
  await persistBacklog(projectRoot, archived);

  let archivedPath: string | undefined;
  const changePath = loaded.state.changePaths[itemId];
  if (changePath && !changePath.includes('/archive/')) {
    try {
      archivedPath = await archiveChangeFolder(projectRoot, changePath);
    } catch (e) {
      return fail(command, [
        `Backlog archived but change folder move failed: ${e instanceof Error ? e.message : String(e)}`,
      ]);
    }
  }

  const nextState: OpenspecStateInput = {
    ...loaded.state,
    activeItemId:
      loaded.state.activeItemId === itemId ? undefined : loaded.state.activeItemId,
    changePaths: archivedPath
      ? { ...loaded.state.changePaths, [itemId]: archivedPath }
      : loaded.state.changePaths,
  };
  const written = await persistState(projectRoot, nextState);
  if (!written.ok) return fail(command, [written.error]);

  return {
    code: 0,
    data: {
      success: true,
      command,
      itemId,
      archivedPath: archivedPath ?? changePath,
    },
  };
}
