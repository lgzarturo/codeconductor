import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import packageJson from '../../package.json';
import { loadConfig } from '../core/config/config-loader';
import {
  buildScorecardRecord,
  createDefaultCriteria,
} from '../core/evaluation/scorecard-calculator';
import {
  appendOutcome,
  aggregateOutcomes,
  generateEvalId,
  listOutcomes,
  loadScorecard,
  saveScorecard,
  type OutcomeFilter,
} from '../core/evaluation/outcome-store';
import {
  collectScorecardSignals,
  criteriaFromSignals,
} from '../core/evaluation/scorecard-signals';
import { resolvePhaseModels } from '../core/evaluation/execution-profile';
import { diffPromptVersions, formatPromptDiffMarkdown } from '../core/evaluation/prompt-diff';
import { runRegressionChecklist } from '../core/evaluation/regression-checklist';
import { generateModelComparisonMarkdown } from '../core/evaluation/model-comparison';
import {
  buildCostQualityMatrix,
  formatMatrixMarkdown,
} from '../core/evaluation/cost-quality-matrix';
import { loadBacklog } from '../core/openspec/backlog-parser';
import type { OutputMode } from '../utils/logger';

export interface ScorecardOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly id?: string;
  readonly taskId?: string;
  readonly agent?: string;
  readonly model?: string;
  readonly fromDiff?: boolean;
  readonly fromVersion?: string;
  readonly toVersion?: string;
  readonly profile?: string;
  readonly costUsd?: number;
  readonly tokens?: number;
  readonly durationMs?: number;
  readonly verdict?: string;
  readonly weightedScore?: number;
  readonly source?: string;
  readonly since?: string;
  readonly modelsFilter?: string[];
}

function contractVersion(): string {
  return packageJson.version;
}

/**
 * Scorecard CLI handler
 */
export async function scorecardCommand(
  options: ScorecardOptions
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, projectRoot } = options;

  switch (subcommand) {
    case 'create':
      return handleCreate(projectRoot, options);
    case 'show':
      return handleShow(projectRoot, options.id);
    case 'record':
      return handleRecord(projectRoot, options);
    case 'list':
      return handleList(projectRoot, options);
    case 'aggregate':
      return handleAggregate(projectRoot, options);
    case 'models':
      return handleModels(projectRoot, options.profile);
    case 'prompt-diff':
      return handlePromptDiff(projectRoot, options);
    case 'regression':
      return handleRegression(projectRoot);
    case 'matrix':
      return handleMatrix(projectRoot);
    case 'compare-models':
      return handleCompareModels(projectRoot, options);
    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'scorecard',
          errors: [
            `Unknown subcommand: ${subcommand}. Use: create, show, record, list, aggregate, models, prompt-diff, regression, matrix, compare-models`,
          ],
        },
      };
  }
}

async function handleCreate(
  projectRoot: string,
  options: ScorecardOptions
): Promise<{ code: number; data?: unknown }> {
  const taskId = options.taskId ?? 'unknown-task';
  const agent = options.agent ?? 'reviewer';
  let criteria = createDefaultCriteria();
  let findings: string[] = [];

  if (options.fromDiff) {
    let scopeFiles: string[] | undefined;
    const backlog = await loadBacklog(projectRoot);
    if (backlog.success && options.taskId) {
      const item = backlog.data.items.find((i) => i.id === options.taskId);
      if (item) {
        scopeFiles = item.scope.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      }
    }
    const hints = collectScorecardSignals(projectRoot, scopeFiles);
    criteria = criteriaFromSignals(hints);
    findings = hints.findings;
  }

  const id = generateEvalId('sc');
  const configResult = await loadConfig(projectRoot);
  const target = configResult.success ? configResult.data.defaults.target : 'opencode';
  const modelResult = await resolvePhaseModels(projectRoot, target);
  const model =
    options.model ??
    (modelResult.success
      ? modelResult.data.find((r) => r.agent === agent)?.model
      : undefined);

  const record = buildScorecardRecord({
    id,
    taskId,
    agent,
    contractVersion: contractVersion(),
    criteria,
    model,
    findings,
    backlogId: options.taskId?.startsWith('BC-') ? options.taskId : undefined,
    source: (options.source as 'openspec' | 'review' | 'manual' | 'pipeline') ?? 'manual',
  });

  const save = await saveScorecard(projectRoot, record);
  if (!save.success) {
    return { code: 1, data: { success: false, errors: [save.error.message] } };
  }

  return {
    code: 0,
    data: {
      success: true,
      command: 'scorecard create',
      scorecard: record,
      path: save.data,
    },
  };
}

async function handleShow(
  projectRoot: string,
  id?: string
): Promise<{ code: number; data?: unknown }> {
  if (!id) {
    return {
      code: 1,
      data: { success: false, errors: ['Scorecard id required. Usage: scorecard show <id>'] },
    };
  }
  const result = await loadScorecard(projectRoot, id);
  if (!result.success) {
    return { code: 1, data: { success: false, errors: [result.error.message] } };
  }
  return { code: 0, data: { success: true, command: 'scorecard show', scorecard: result.data } };
}

async function handleRecord(
  projectRoot: string,
  options: ScorecardOptions
): Promise<{ code: number; data?: unknown }> {
  const taskId = options.taskId ?? 'unknown-task';
  const outcome = {
    id: generateEvalId('out'),
    taskId,
    source: (options.source as 'openspec' | 'review' | 'manual' | 'pipeline') ?? 'manual',
    agent: options.agent ?? 'reviewer',
    model: options.model ?? 'unknown',
    contractVersion: contractVersion(),
    timestamp: new Date().toISOString(),
    verdict: options.verdict as 'PASS' | 'REVISE' | 'REJECT' | undefined,
    weightedScore: options.weightedScore,
    backlogId: taskId.startsWith('BC-') ? taskId : undefined,
    costUsd: options.costUsd,
    tokensIn: options.tokens,
    durationMs: options.durationMs,
    status:
      options.verdict === 'PASS'
        ? ('pass' as const)
        : options.verdict === 'REJECT'
          ? ('reject' as const)
          : undefined,
  };

  const result = await appendOutcome(projectRoot, outcome);
  if (!result.success) {
    return { code: 1, data: { success: false, errors: [result.error.message] } };
  }
  return { code: 0, data: { success: true, command: 'scorecard record', outcome } };
}

async function handleList(
  projectRoot: string,
  options: ScorecardOptions
): Promise<{ code: number; data?: unknown }> {
  const filter: OutcomeFilter = {
    agent: options.agent,
    model: options.model,
    taskId: options.taskId,
    since: options.since,
    source: options.source as OutcomeFilter['source'],
  };
  const result = await listOutcomes(projectRoot, filter);
  if (!result.success) {
    return { code: 1, data: { success: false, errors: [result.error.message] } };
  }
  return {
    code: 0,
    data: { success: true, command: 'scorecard list', outcomes: result.data, count: result.data.length },
  };
}

async function handleAggregate(
  projectRoot: string,
  options: ScorecardOptions
): Promise<{ code: number; data?: unknown }> {
  const filter: OutcomeFilter = { since: options.since, agent: options.agent, model: options.model };
  const list = await listOutcomes(projectRoot, filter);
  if (!list.success) {
    return { code: 1, data: { success: false, errors: [list.error.message] } };
  }
  const agg = aggregateOutcomes(list.data);
  return { code: 0, data: { success: true, command: 'scorecard aggregate', ...agg } };
}

async function handleModels(
  projectRoot: string,
  profile?: string
): Promise<{ code: number; data?: unknown }> {
  const configResult = await loadConfig(projectRoot);
  const target = configResult.success ? configResult.data.defaults.target : 'opencode';
  const result = await resolvePhaseModels(projectRoot, target);
  if (!result.success) {
    return { code: 1, data: { success: false, errors: [result.error.message] } };
  }
  return {
    code: 0,
    data: {
      success: true,
      command: 'scorecard models',
      profile: profile ?? 'balanced',
      phases: result.data,
    },
  };
}

async function handlePromptDiff(
  projectRoot: string,
  options: ScorecardOptions
): Promise<{ code: number; data?: unknown }> {
  if (!options.fromVersion || !options.toVersion) {
    return {
      code: 1,
      data: {
        success: false,
        errors: ['Usage: scorecard prompt-diff <fromVersion> <toVersion>'],
      },
    };
  }
  const configResult = await loadConfig(projectRoot);
  const target = configResult.success ? configResult.data.defaults.target : 'opencode';
  const diff = await diffPromptVersions(options.fromVersion, options.toVersion, {
    target,
    agent: options.agent,
    projectRoot,
  });
  const markdown = formatPromptDiffMarkdown(diff);
  return {
    code: 0,
    data: { success: true, command: 'scorecard prompt-diff', diff, markdown },
  };
}

async function handleRegression(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const result = await runRegressionChecklist(projectRoot);
  if (!result.success) {
    return { code: 1, data: { success: false, errors: [result.error.message] } };
  }
  return {
    code: result.data.passed ? 0 : 1,
    data: { success: result.data.passed, command: 'scorecard regression', report: result.data },
  };
}

async function handleMatrix(projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const list = await listOutcomes(projectRoot);
  if (!list.success) {
    return { code: 1, data: { success: false, errors: [list.error.message] } };
  }
  const matrix = await buildCostQualityMatrix(projectRoot, list.data);
  const markdown = formatMatrixMarkdown(matrix);
  return {
    code: 0,
    data: { success: true, command: 'scorecard matrix', matrix, markdown },
  };
}

async function handleCompareModels(
  projectRoot: string,
  options: ScorecardOptions
): Promise<{ code: number; data?: unknown }> {
  const filter: OutcomeFilter = { since: options.since };
  const list = await listOutcomes(projectRoot, filter);
  if (!list.success) {
    return { code: 1, data: { success: false, errors: [list.error.message] } };
  }
  let outcomes = list.data;
  if (options.modelsFilter && options.modelsFilter.length > 0) {
    outcomes = outcomes.filter((o) => options.modelsFilter!.includes(o.model));
  }
  const markdown = generateModelComparisonMarkdown(outcomes, options.modelsFilter);
  const templatePath = resolve(projectRoot, '.codeconductor/evaluation/model-comparison-last.md');
  try {
    await readFile(templatePath);
  } catch {
    // optional write
  }
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(resolve(projectRoot, '.codeconductor/evaluation'), { recursive: true });
  await writeFile(templatePath, markdown, 'utf-8');

  return {
    code: 0,
    data: {
      success: true,
      command: 'scorecard compare-models',
      markdown,
      path: templatePath,
      outcomeCount: outcomes.length,
    },
  };
}
