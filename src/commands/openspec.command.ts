import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  loadBacklogSession,
  BacklogSessionError,
  type BacklogSession,
} from '../core/openspec/backlog-session';
import { buildItemSnapshot } from '../core/openspec/backlog-scanner';
import {
  planTaskCardsForItem,
  selectNextItem,
} from '../core/openspec/backlog-planner';
import {
  generateOpenspecChange,
  ensureOpenspecConfig,
  syncTaskCardCheckbox,
  archiveChangeFolder,
} from '../core/openspec/openspec-generator';
import { assessChangeFolder } from '../core/openspec/spec-quality';
import { analyzeChangeFolder } from '../core/openspec/spec-analyzer';
import type { SpecAnalyzeReport } from '../core/openspec/spec-analyzer';
import { syncChangeSpecs } from '../core/openspec/spec-sync';
import {
  missingArtifacts,
  readArtifactProgress,
} from '../core/openspec/artifact-progress';
import type { ArtifactProgress } from '../core/openspec/artifact-progress';
import { SpecAnalyzeReportSchema } from '../validation/schemas';
import { hasTddRunnerEvidence, recordRedValidation } from '../core/verification/verification-runner';
import { hasPassingScorecard } from '../core/evaluation/outcome-store';
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
import type { OutputMode } from '../utils/logger';
import type {
  BacklogDocumentInput,
  BacklogItemInput,
  BacklogStatusInput,
  OpenspecStateInput,
  OpenspecTaskCardInput,
} from '../validation/schemas';
import type { ValidationReport } from '../core/openspec/backlog-validator';
import type { Result } from '../utils/result';

export interface OpenspecOptions {
  readonly subcommand: string;
  readonly itemId?: string;
  readonly reason?: string;
  readonly allowUnchecked?: boolean;
  readonly projectRoot: string;
  readonly output: OutputMode;
}

const KNOWN_SUBCOMMANDS =
  'validate, scan, plan, analyze, status, next, start, done, block, unblock, archive, sync, verify';

/**
 * Openspec CLI — validate, scan, plan, status, next, start, done, block, unblock, archive
 */
export async function openspecCommand(
  options: OpenspecOptions
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, itemId, projectRoot, output, reason, allowUnchecked } = options;
  void output;

  switch (subcommand) {
    case 'validate':
      return handleValidate(projectRoot);
    case 'scan':
      return handleScan(projectRoot);
    case 'plan':
      return handlePlan(projectRoot, itemId);
    case 'analyze':
      return handleAnalyze(projectRoot, itemId);
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
    case 'unblock':
      return handleUnblock(projectRoot, itemId);
    case 'archive':
      return handleArchive(projectRoot, itemId, allowUnchecked);
    case 'sync':
      return handleSync(projectRoot, itemId);
    case 'verify':
      return handleVerify(projectRoot, itemId);
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

async function transitionItem(
  projectRoot: string,
  item: BacklogItemInput,
  to: BacklogStatusInput,
  progress: number | undefined,
  content: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const next = applyBacklogTransition(content, item.id, item.status, to, progress);
  if (!next.success) {
    return { ok: false, error: next.error.message };
  }
  await persistBacklog(projectRoot, next.data);
  return { ok: true, content: next.data };
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

function resolveActiveChange(
  state: OpenspecStateInput,
  command: string,
  itemId?: string,
):
  | { ok: true; targetId: string; changePath: string }
  | { ok: false; response: { code: number; data?: unknown } } {
  const targetId = itemId ?? state.activeItemId;
  if (!targetId) {
    return {
      ok: false,
      response: fail(command, ['No active change. Run openspec plan or pass an item id.']),
    };
  }
  const changePath = state.changePaths[targetId];
  if (!changePath || changePath.includes('/archive/')) {
    return { ok: false, response: fail(command, [`No active change folder for ${targetId}`]) };
  }
  return { ok: true, targetId, changePath };
}

async function collectAnalyzeReport(
  projectRoot: string,
  session: BacklogSession,
  targetId: string,
  changePath: string,
): Promise<{ tddRequired: boolean; report: SpecAnalyzeReport }> {
  const tddRequired = session.doc.global.tddRequired;
  const policyParts: string[] = [];
  try {
    policyParts.push(await readFile(resolve(projectRoot, 'AGENTS.md'), 'utf-8'));
  } catch {
    // optional
  }
  policyParts.push(session.raw);

  const cards = itemCards(session.state, targetId);
  const tddCards = cards.filter((c) => c.phase === 'test' || c.phase === 'implement');
  let hasTddEvidence: boolean | undefined;
  if (tddCards.length > 0) {
    hasTddEvidence = true;
    for (const card of tddCards) {
      const expectedPhase = card.phase === 'test' ? 'red' : 'green';
      if (!(await hasTddRunnerEvidence(projectRoot, card.id, expectedPhase))) {
        hasTddEvidence = false;
        break;
      }
    }
  }

  const report = await analyzeChangeFolder(projectRoot, changePath, {
    tddRequired,
    policyText: policyParts.join('\n'),
    hasTddEvidence,
  });
  return { tddRequired, report };
}

function buildNextSteps(input: {
  state: OpenspecStateInput | null;
  nextItemId: string | undefined;
  progress: ArtifactProgress | undefined;
}): string[] {
  const { state, nextItemId, progress } = input;
  if (!state || !state.activeItemId) {
    return [
      nextItemId
        ? `Run openspec plan ${nextItemId} to start the next READY item.`
        : 'No active change and no READY item. Author one with /cc-backlog, then run openspec plan <BC-id>.',
    ];
  }
  const itemId = state.activeItemId;
  const steps: string[] = [];
  if (progress) {
    const missing = missingArtifacts(progress.artifacts);
    if (missing.length > 0) {
      steps.push(
        `Change folder is missing ${missing.join(', ')} — re-run openspec plan ${itemId} or restore them.`,
      );
    }
  }
  const cards = itemCards(state, itemId);
  const blocked = cards.find((c) => c.status === 'blocked');
  if (blocked) {
    steps.push(`Run openspec unblock ${blocked.id} to resume the blocked card.`);
    return steps;
  }
  const next = getNextTaskCard(state);
  if (next && next.backlogId === itemId) {
    steps.push(`Run openspec start ${next.id} then delegate to ${next.agent}.`);
    return steps;
  }
  const doing = cards.find((c) => c.status === 'doing');
  if (doing) {
    steps.push(`Run openspec done ${doing.id} when the ${doing.phase} phase completes.`);
    return steps;
  }
  if (cards.length > 0 && cards.every((c) => c.status === 'done')) {
    steps.push(
      `Run openspec verify ${itemId}, record a scorecard verdict, then run openspec archive ${itemId}.`,
    );
    return steps;
  }
  steps.push(`Run openspec next to get the next TaskCard for ${itemId}.`);
  return steps;
}

async function assessActiveChangeSpecs(
  projectRoot: string,
  state: OpenspecStateInput,
): Promise<{ specValid: boolean; errors: string[]; recommendations: string[] }> {
  const errors: string[] = [];
  const recommendations: string[] = [];
  let specValid = true;

  const activeId = state.activeItemId;
  const changePath = activeId ? state.changePaths[activeId] : undefined;
  if (changePath && !changePath.includes('/archive/')) {
    const specReport = await assessChangeFolder(projectRoot, changePath);
    specValid = specReport.valid;
    for (const issue of specReport.issues.filter((i) => i.severity === 'error')) {
      errors.push(`${issue.path}: ${issue.message}`);
    }
    if (specReport.stopForClarify) {
      recommendations.push(
        'Spec has [NEEDS CLARIFICATION] markers — run ccep evaluate and wait for human input.',
      );
    }
  }

  return { specValid, errors, recommendations };
}

interface SessionParts {
  readonly doc: BacklogDocumentInput;
  readonly state: OpenspecStateInput;
  readonly report: ValidationReport;
}

function sessionParts(session: BacklogSession | BacklogSessionError): SessionParts {
  return { doc: session.doc, state: session.state, report: session.report };
}

async function buildValidationResponse(
  projectRoot: string,
  sessionResult: Result<BacklogSession, Error>,
): Promise<{ code: number; data?: unknown }> {
  if (!sessionResult.success && !(sessionResult.error instanceof BacklogSessionError)) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'openspec validate',
        errors: [sessionResult.error.message],
        recommendations: [
          'Create BACKLOG.md at project root using the CodeConductor template.',
        ],
      },
    };
  }

  const { doc, state, report } = sessionParts(
    sessionResult.success ? sessionResult.data : sessionResult.error as BacklogSessionError
  );
  const errors = report.errors.map((e) => e.message);
  const recommendations = [...report.recommendations];

  const spec = await assessActiveChangeSpecs(projectRoot, state);
  errors.push(...spec.errors);
  recommendations.push(...spec.recommendations);

  const valid = report.valid && spec.specValid;
  return {
    code: valid ? 0 : 1,
    data: {
      success: valid,
      command: 'openspec validate',
      valid,
      errors,
      recommendations,
      itemCount: doc.items.length,
      archiveCount: doc.archive.length,
    },
  };
}

async function handleValidate(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  return buildValidationResponse(projectRoot, await loadBacklogSession(projectRoot));
}

async function handleScan(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'openspec scan',
        errors: [sessionResult.error.message],
      },
    };
  }

  const { doc, state: loadedState, scan } = sessionResult.data;
  const snapshots = buildItemSnapshot(doc.items, doc.archive);
  const state = {
    ...loadedState,
    lastScanHash: scan.contentHash,
    lastScanAt: new Date().toISOString(),
    itemSnapshots: snapshots,
  };
  const written = await persistState(projectRoot, state);
  if (!written.ok) {
    return fail('openspec scan', [written.error]);
  }

  return {
    code: 0,
    data: {
      success: true,
      command: 'openspec scan',
      ...scan,
    },
  };
}

async function handlePlan(
  projectRoot: string,
  itemId?: string
): Promise<{ code: number; data?: unknown }> {
  const sessionResult = await loadBacklogSession(projectRoot);
  const validateFirst = await buildValidationResponse(projectRoot, sessionResult);
  if (validateFirst.code !== 0) return validateFirst;
  if (!sessionResult.success) return validateFirst;

  const session = sessionResult.data;
  const doc = session.doc;
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

  const existingState = session.state;

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
  const changePath = await generateOpenspecChange(projectRoot, item, taskCards, {
    tddRequired: doc.global.tddRequired,
    acceptanceCriteria: item.acceptanceCriteria,
  });

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

  const transition = applyBacklogTransition(
    session.raw,
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

async function handleAnalyze(
  projectRoot: string,
  itemId?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec analyze';
  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) return fail(command, [sessionResult.error.message]);
  const session = sessionResult.data;
  const resolved = resolveActiveChange(session.state, command, itemId);
  if (!resolved.ok) return resolved.response;

  const { report } = await collectAnalyzeReport(
    projectRoot,
    session,
    resolved.targetId,
    resolved.changePath,
  );
  const data = SpecAnalyzeReportSchema.parse({
    changePath: report.changePath,
    frIds: report.frIds,
    scIds: report.scIds,
    mappedFr: report.mappedFr,
    mappedSc: report.mappedSc,
    mappedToTests: report.mappedToTests,
    frCoveragePct: report.frCoveragePct,
    scCoveragePct: report.scCoveragePct,
    testCoveragePct: report.testCoveragePct,
    findings: report.findings,
    stop: report.stop,
  });

  return {
    code: report.stop ? 1 : 0,
    data: {
      success: !report.stop,
      command,
      ...data,
      stopForClarify: report.quality.stopForClarify,
    },
  };
}

async function handleSync(
  projectRoot: string,
  itemId?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec sync';
  const loaded = await loadStateOrFail(projectRoot, command);
  if (!loaded.ok) return loaded.response;
  const resolved = resolveActiveChange(loaded.state, command, itemId);
  if (!resolved.ok) return resolved.response;

  const synced = await syncChangeSpecs(projectRoot, resolved.changePath);
  if (!synced.success) {
    return fail(command, [
      `Spec sync failed for ${resolved.targetId}: ${synced.errors.join('; ')}`,
    ]);
  }
  return {
    code: 0,
    data: {
      success: true,
      command,
      itemId: resolved.targetId,
      changePath: resolved.changePath,
      syncedPaths: synced.syncedPaths,
    },
  };
}

type VerifySeverity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
type VerifyDimension = 'Completeness' | 'Correctness' | 'Coherence';

interface VerifyIssue {
  readonly severity: VerifySeverity;
  readonly code: string;
  readonly message: string;
  readonly dimension: VerifyDimension;
}

function analyzeSeverityToVerify(severity: string): VerifySeverity {
  if (severity === 'CRITICAL') return 'CRITICAL';
  if (severity === 'HIGH') return 'WARNING';
  return 'SUGGESTION';
}

async function handleVerify(
  projectRoot: string,
  itemId?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec verify';
  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) return fail(command, [sessionResult.error.message]);
  const session = sessionResult.data;
  const resolved = resolveActiveChange(session.state, command, itemId);
  if (!resolved.ok) return resolved.response;
  const { targetId, changePath } = resolved;

  const itemLoaded = findItemOrFail(session, targetId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  const { report } = await collectAnalyzeReport(projectRoot, session, targetId, changePath);
  const progress = await readArtifactProgress(projectRoot, changePath);
  const cards = itemCards(session.state, targetId);
  const doneCount = cards.filter((c) => c.status === 'done').length;

  const issues: VerifyIssue[] = [];
  for (const finding of report.findings) {
    const dimension: VerifyDimension =
      finding.code === 'POLICY_CONFLICT' || finding.code === 'NEEDS_CLARIFICATION'
        ? 'Coherence'
        : 'Correctness';
    issues.push({
      severity: analyzeSeverityToVerify(finding.severity),
      code: finding.code,
      message: finding.message,
      dimension,
    });
  }

  if (cards.length === 0) {
    issues.push({
      severity: 'WARNING',
      code: 'NO_CARDS',
      message: `No task cards for ${targetId}. Run openspec plan ${targetId}.`,
      dimension: 'Completeness',
    });
  } else if (doneCount < cards.length) {
    const pending = cards.filter((c) => c.status !== 'done').map((c) => c.id);
    issues.push({
      severity: 'WARNING',
      code: 'CARDS_PENDING',
      message: `${cards.length - doneCount} card(s) not done (${pending.join(', ')}).`,
      dimension: 'Completeness',
    });
  }

  for (const name of missingArtifacts(progress.artifacts)) {
    issues.push({
      severity: 'WARNING',
      code: 'ARTIFACT_MISSING',
      message: `Change folder is missing ${name}.`,
      dimension: 'Completeness',
    });
  }

  if (progress.checkboxes.remaining > 0) {
    issues.push({
      severity: 'WARNING',
      code: 'CHECKBOXES_REMAINING',
      message:
        `${progress.checkboxes.remaining} of ${progress.checkboxes.total} tasks.md boxes are unchecked. ` +
        'Tick them as FRs complete (only [x]/[X] counts).',
      dimension: 'Completeness',
    });
  }

  const scorecardOk =
    !itemLoaded.reviewRequired || (await hasPassingScorecard(projectRoot, targetId));
  if (!scorecardOk) {
    issues.push({
      severity: 'WARNING',
      code: 'SCORECARD_PENDING',
      message: `Global review is required but no PASS scorecard exists for ${targetId}.`,
      dimension: 'Coherence',
    });
  }

  const archiveReady =
    !issues.some((i) => i.severity === 'CRITICAL') &&
    cards.length > 0 &&
    doneCount === cards.length &&
    missingArtifacts(progress.artifacts).length === 0 &&
    progress.checkboxes.remaining === 0 &&
    scorecardOk;

  return {
    code: 0,
    data: {
      success: true,
      command,
      advisory: true,
      itemId: targetId,
      changePath,
      archiveReady,
      artifacts: progress.artifacts,
      checkboxProgress: progress.checkboxes,
      cardsTotal: cards.length,
      cardsDone: doneCount,
      frCoveragePct: report.frCoveragePct,
      scCoveragePct: report.scCoveragePct,
      testCoveragePct: report.testCoveragePct,
      issues,
    },
  };
}

async function handleStatus(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const sessionResult = await loadBacklogSession(projectRoot);

  let doc: BacklogDocumentInput | null = null;
  let state: OpenspecStateInput | null = null;
  if (sessionResult.success) {
    doc = sessionResult.data.doc;
    state = sessionResult.data.state;
  } else if (sessionResult.error instanceof BacklogSessionError) {
    doc = sessionResult.error.doc;
    state = sessionResult.error.state;
  } else {
    const fallback = await loadOpenspecState(projectRoot);
    state = fallback.success ? fallback.data : null;
  }

  const nextItem = doc ? selectNextItem(doc) : null;
  const pendingCards = state?.taskCards.filter((c) => c.status === 'pending').length ?? 0;
  const doneCards = state?.taskCards.filter((c) => c.status === 'done').length ?? 0;

  const changePath = state?.activeItemId ? state.changePaths[state.activeItemId] : undefined;
  const progress =
    changePath && !changePath.includes('/archive/')
      ? await readArtifactProgress(projectRoot, changePath)
      : undefined;

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
      artifacts: progress?.artifacts,
      checkboxProgress: progress?.checkboxes,
      nextSteps: buildNextSteps({ state, nextItemId: nextItem?.id, progress }),
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
    const doing = stateResult.data.taskCards.find((c) => c.status === 'doing');
    return {
      code: 0,
      data: {
        success: true,
        command: 'openspec next',
        taskCard: null,
        ...(doing ? { inProgressCardId: doing.id } : {}),
        message: doing
          ? `${doing.id} is in progress. Finish it with: openspec done ${doing.id}`
          : 'No pending task cards. Run openspec plan first.',
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

function findItemOrFail(
  session: BacklogSession,
  itemId: string,
  command: string,
):
  | { ok: true; item: BacklogItemInput; reviewRequired: boolean }
  | { ok: false; response: { code: number; data?: unknown } } {
  const item =
    session.doc.items.find((i) => i.id === itemId) ??
    session.doc.archive.find((i) => i.id === itemId);
  if (!item) {
    return { ok: false, response: fail(command, [`Backlog item ${itemId} not found`]) };
  }
  return {
    ok: true,
    item,
    reviewRequired: session.doc.global.reviewRequired,
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
  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) return fail(command, [sessionResult.error.message]);
  const session = sessionResult.data;
  const card = findCard(session.state, cardId);
  if (!card) {
    return fail(command, [`Task card ${cardId} not found`]);
  }
  if (card.status !== 'pending' && card.status !== 'doing') {
    return fail(command, [`Card ${cardId} cannot start from status ${card.status}`]);
  }

  const itemLoaded = findItemOrFail(session, card.backlogId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  let state = session.state;
  let baseWarning: string | undefined;
  if (!state.itemBaseCommits?.[card.backlogId]) {
    try {
      const base = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      state = { ...state, itemBaseCommits: { ...state.itemBaseCommits, [card.backlogId]: base } };
    } catch {
      baseWarning = 'Item base unavailable: could not resolve git HEAD.';
    }
  }
  if (card.status === 'pending' || state !== session.state) {
    state = setTaskCardStatus(state, cardId, 'doing');
    const written = await persistState(projectRoot, state);
    if (!written.ok) return fail(command, [written.error]);
  }

  const transition = await transitionItem(
    projectRoot,
    itemLoaded.item,
    'IN_PROGRESS',
    itemLoaded.item.progress,
    session.raw,
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
      ...(baseWarning ? { warnings: [baseWarning] } : {}),
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
  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) return fail(command, [sessionResult.error.message]);
  const session = sessionResult.data;
  const card = findCard(session.state, cardId);
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

  const itemLoaded = findItemOrFail(session, card.backlogId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  const tddRequired = session.doc.global.tddRequired;
  if (tddRequired && (card.phase === 'test' || card.phase === 'implement')) {
    const expectedPhase = card.phase === 'test' ? 'red' : 'green';
    const message = `Card ${cardId} (${card.phase}) requires current ${expectedPhase.toUpperCase()} verification-runner TDD evidence. Run: tdd capture --task ${cardId} --phase ${expectedPhase} --command "<test command>", then openspec done.`;
    if (card.phase === 'test') {
      const recorded = await recordRedValidation(projectRoot, cardId);
      if (!recorded.success) return fail(command, [`${message} ${recorded.error.message}`]);
    } else if (!(await hasTddRunnerEvidence(projectRoot, cardId, expectedPhase))) {
      return fail(command, [message]);
    }
  }

  const state = setTaskCardStatus(session.state, cardId, 'done');
  const cards = itemCards(state, card.backlogId);
  const doneCount = cards.filter((c) => c.status === 'done').length;
  const progress = cards.length === 0 ? 0 : Math.round((doneCount / cards.length) * 100);
  const allDone = cards.length > 0 && doneCount === cards.length;

  const written = await persistState(projectRoot, state);
  if (!written.ok) return fail(command, [written.error]);

  const changePath = state.changePaths[card.backlogId];
  if (changePath) await syncTaskCardCheckbox(projectRoot, changePath, cardId, true);

  const nextStatus: BacklogStatusInput = allDone ? 'REVIEW' : 'IN_PROGRESS';
  const transition = await transitionItem(projectRoot, itemLoaded.item, nextStatus, progress, session.raw);
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
  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) return fail(command, [sessionResult.error.message]);
  const session = sessionResult.data;
  const card = findCard(session.state, cardId);
  if (!card) {
    return fail(command, [`Task card ${cardId} not found`]);
  }

  const itemLoaded = findItemOrFail(session, card.backlogId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  const state = setTaskCardStatus(session.state, cardId, 'blocked');
  const written = await persistState(projectRoot, state);
  if (!written.ok) return fail(command, [written.error]);

  const transition = await transitionItem(projectRoot, itemLoaded.item, 'BLOCKED', undefined, session.raw);
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

async function handleUnblock(
  projectRoot: string,
  cardId?: string,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec unblock';
  if (!cardId) {
    return fail(command, ['Missing card id. Usage: openspec unblock <cardId>']);
  }

  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) return fail(command, [sessionResult.error.message]);
  const session = sessionResult.data;
  const card = findCard(session.state, cardId);
  if (!card) {
    return fail(command, [`Task card ${cardId} not found`]);
  }
  if (card.status !== 'blocked') {
    return fail(command, [`Card ${cardId} must be blocked before unblock (got ${card.status})`]);
  }

  const itemLoaded = findItemOrFail(session, card.backlogId, command);
  if (!itemLoaded.ok) return itemLoaded.response;
  if (itemLoaded.item.status !== 'BLOCKED') {
    return fail(command, [
      `Backlog item ${itemLoaded.item.id} must be BLOCKED before unblock (got ${itemLoaded.item.status})`,
    ]);
  }

  const state = setTaskCardStatus(session.state, cardId, 'pending');
  const written = await persistState(projectRoot, state);
  if (!written.ok) return fail(command, [written.error]);

  const changePath = state.changePaths[card.backlogId];
  if (changePath) await syncTaskCardCheckbox(projectRoot, changePath, cardId, false);

  const transition = await transitionItem(projectRoot, itemLoaded.item, 'READY', undefined, session.raw);
  if (!transition.ok) return fail(command, [transition.error]);

  return {
    code: 0,
    data: {
      success: true,
      command,
      cardId,
      cardStatus: 'pending',
      itemId: itemLoaded.item.id,
      itemStatus: 'READY',
      nextStep: `Run openspec plan ${itemLoaded.item.id}.`,
    },
  };
}

async function handleArchive(
  projectRoot: string,
  itemId?: string,
  allowUnchecked = false,
): Promise<{ code: number; data?: unknown }> {
  const command = 'openspec archive';
  if (!itemId) {
    return fail(command, ['Missing item id. Usage: openspec archive <itemId>']);
  }
  const sessionResult = await loadBacklogSession(projectRoot);
  if (!sessionResult.success) return fail(command, [sessionResult.error.message]);
  const session = sessionResult.data;
  const itemLoaded = findItemOrFail(session, itemId, command);
  if (!itemLoaded.ok) return itemLoaded.response;

  const cards = itemCards(session.state, itemId);
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
    const passed = await hasPassingScorecard(projectRoot, itemId);
    if (!passed) {
      return fail(command, [
        `Cannot archive ${itemId}: global.reviewRequired needs a PASS scorecard for this backlog id`,
      ]);
    }
  }

  let archivedPath: string | undefined;
  const changePath = session.state.changePaths[itemId];
  const warnings: string[] = [];
  if (changePath && !changePath.includes('/archive/')) {
    const progress = await readArtifactProgress(projectRoot, changePath);
    const missing = missingArtifacts(progress.artifacts);
    if (missing.length > 0) {
      return fail(command, [
        `Cannot archive ${itemId}: change folder is missing ${missing.join(', ')}. Re-run openspec plan ${itemId} or restore them.`,
      ]);
    }
    const { report } = await collectAnalyzeReport(projectRoot, session, itemId, changePath);
    const critical = report.findings.filter((f) => f.severity === 'CRITICAL');
    if (critical.length > 0) {
      return fail(command, [
        `Cannot archive ${itemId}: analyze reports ${critical.length} CRITICAL finding(s): ${critical.map((f) => f.code).join(', ')}. Resolve them first.`,
      ]);
    }
    if (progress.checkboxes.remaining > 0) {
      const unchecked = `${progress.checkboxes.remaining} of ${progress.checkboxes.total} tasks.md checkboxes are unchecked (only [x]/[X] counts as done)`;
      if (!allowUnchecked) {
        return fail(command, [
          `Cannot archive ${itemId}: ${unchecked}. Tick them as the work completes, or pass --allow-unchecked to archive anyway.`,
        ]);
      }
      warnings.push(`${unchecked}; archived with --allow-unchecked.`);
    }
    const synced = await syncChangeSpecs(projectRoot, changePath);
    if (!synced.success) {
      return fail(command, [`Cannot archive ${itemId}: spec sync failed: ${synced.errors.join('; ')}`]);
    }
    try {
      archivedPath = await archiveChangeFolder(projectRoot, changePath);
    } catch (e) {
      return fail(command, [
        `Backlog archived but change folder move failed: ${e instanceof Error ? e.message : String(e)}`,
      ]);
    }
  }

  let content = session.raw;
  if (itemLoaded.item.status !== 'DONE') {
    const toDone = await transitionItem(projectRoot, itemLoaded.item, 'DONE', 100, content);
    if (!toDone.ok) return fail(command, [toDone.error]);
    content = toDone.content;
  }

  const archived = archiveItemInMarkdown(content, itemId);
  await persistBacklog(projectRoot, archived);

  const nextState: OpenspecStateInput = {
    ...session.state,
    activeItemId:
      session.state.activeItemId === itemId ? undefined : session.state.activeItemId,
    changePaths: archivedPath
      ? { ...session.state.changePaths, [itemId]: archivedPath }
      : session.state.changePaths,
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
      warnings,
    },
  };
}
