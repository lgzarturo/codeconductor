import { readFile, writeFile } from 'node:fs/promises';
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
} from '../core/openspec/openspec-generator';
import {
  loadOpenspecState,
  writeOpenspecState,
  getNextTaskCard,
  updateBacklogItemInMarkdown,
} from '../core/openspec/openspec-state';
import { BACKLOG_FILENAME } from '../core/openspec/backlog-parser';
import type { OutputMode } from '../utils/logger';

export interface OpenspecOptions {
  readonly subcommand: string;
  readonly itemId?: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
}

/**
 * Openspec CLI — validate, scan, plan, status, next
 */
export async function openspecCommand(
  options: OpenspecOptions
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, itemId, projectRoot, output } = options;

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
    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'openspec',
          errors: [
            `Unknown subcommand: ${subcommand}. Use: validate, scan, plan, status, next`,
          ],
        },
      };
  }
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
    await writeOpenspecState(projectRoot, state);
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
  };

  const taskCards = planTaskCardsForItem(item, doc, existingState.taskCards);
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
  };
  await writeOpenspecState(projectRoot, newState);

  const backlogPath = resolve(projectRoot, BACKLOG_FILENAME);
  let content = await readFile(backlogPath, 'utf-8');
  content = updateBacklogItemInMarkdown(content, item.id, {
    status: 'PLANNED',
    progress: item.progress,
  });
  await writeFile(backlogPath, content, 'utf-8');

  return {
    code: 0,
    data: {
      success: true,
      command: 'openspec plan',
      itemId: item.id,
      title: item.title,
      changePath,
      taskCards,
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

  return {
    code: 0,
    data: {
      success: true,
      command: 'openspec next',
      taskCard: next,
    },
  };
}
