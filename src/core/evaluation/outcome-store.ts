import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  EvaluationIndexSchema,
  ScorecardRecordSchema,
  TaskOutcomeSchema,
  type EvaluationIndexInput,
  type ScorecardRecordInput,
  type TaskOutcomeInput,
} from '../../validation/schemas';
import { err, ok, type Result } from '../../utils/result';

const EVAL_DIR = '.codeconductor/evaluation';
const OUTCOMES_FILE = 'outcomes.jsonl';
const SCORECARDS_DIR = 'scorecards';
const INDEX_FILE = 'index.json';

export interface OutcomeFilter {
  agent?: string;
  model?: string;
  taskId?: string;
  backlogId?: string;
  since?: string;
  source?: TaskOutcomeInput['source'];
  experimentId?: string;
  variantId?: string;
  suiteTaskId?: string;
}

/**
 * Ensure evaluation directory exists.
 */
export async function ensureEvaluationDir(projectRoot: string): Promise<string> {
  const dir = resolve(projectRoot, EVAL_DIR);
  await mkdir(dir, { recursive: true });
  await mkdir(resolve(dir, SCORECARDS_DIR), { recursive: true });
  return dir;
}

/**
 * Append a task outcome to outcomes.jsonl.
 */
export async function appendOutcome(
  projectRoot: string,
  outcome: TaskOutcomeInput
): Promise<Result<void, Error>> {
  try {
    const dir = await ensureEvaluationDir(projectRoot);
    const validated = TaskOutcomeSchema.parse(outcome);
    await appendFile(resolve(dir, OUTCOMES_FILE), JSON.stringify(validated) + '\n', 'utf-8');

    const indexPath = resolve(dir, INDEX_FILE);
    let index: EvaluationIndexInput = { version: 1, lastOutcomeId: validated.id };
    try {
      const raw = await readFile(indexPath, 'utf-8');
      index = EvaluationIndexSchema.parse(JSON.parse(raw));
      index.lastOutcomeId = validated.id;
    } catch {
      // new index
    }
    await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * List outcomes with optional filters.
 */
export async function listOutcomes(
  projectRoot: string,
  filter: OutcomeFilter = {}
): Promise<Result<TaskOutcomeInput[], Error>> {
  try {
    const path = resolve(projectRoot, EVAL_DIR, OUTCOMES_FILE);
    const content = await readFile(path, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const outcomes: TaskOutcomeInput[] = [];
    for (const line of lines) {
      const parsed = TaskOutcomeSchema.parse(JSON.parse(line));
      if (filter.agent && parsed.agent !== filter.agent) continue;
      if (filter.model && parsed.model !== filter.model) continue;
      if (filter.taskId && parsed.taskId !== filter.taskId) continue;
      if (filter.backlogId && parsed.backlogId !== filter.backlogId) continue;
      if (filter.source && parsed.source !== filter.source) continue;
      if (filter.since && parsed.timestamp < filter.since) continue;
      if (filter.experimentId && parsed.experimentId !== filter.experimentId) continue;
      if (filter.variantId && parsed.variantId !== filter.variantId) continue;
      if (filter.suiteTaskId && parsed.suiteTaskId !== filter.suiteTaskId) continue;
      outcomes.push(parsed);
    }
    return ok(outcomes);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok([]);
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Save scorecard JSON to scorecards/{id}.json
 */
export async function saveScorecard(
  projectRoot: string,
  record: ScorecardRecordInput
): Promise<Result<string, Error>> {
  try {
    const dir = await ensureEvaluationDir(projectRoot);
    const validated = ScorecardRecordSchema.parse(record);
    const filePath = resolve(dir, SCORECARDS_DIR, `${validated.id}.json`);
    await writeFile(filePath, JSON.stringify(validated, null, 2), 'utf-8');
    return ok(filePath);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Load scorecard by id.
 */
export async function loadScorecard(
  projectRoot: string,
  id: string
): Promise<Result<ScorecardRecordInput, Error>> {
  try {
    const filePath = resolve(projectRoot, EVAL_DIR, SCORECARDS_DIR, `${id}.json`);
    const content = await readFile(filePath, 'utf-8');
    return ok(ScorecardRecordSchema.parse(JSON.parse(content)));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Aggregate stats from outcomes.
 */
export function aggregateOutcomes(outcomes: TaskOutcomeInput[]): {
  total: number;
  passRate: number;
  avgWeightedScore: number;
  byAgent: Record<string, { count: number; avgScore: number }>;
  byModel: Record<string, { count: number; avgScore: number; avgCost?: number; avgTokens?: number }>;
  byVariant: Record<string, { count: number; avgScore: number }>;
} {
  const withScore = outcomes.filter((o) => o.weightedScore !== undefined);
  const passed = outcomes.filter((o) => o.verdict === 'PASS' || o.status === 'pass');
  const avgWeightedScore =
    withScore.length > 0
      ? withScore.reduce((s, o) => s + (o.weightedScore ?? 0), 0) / withScore.length
      : 0;

  const byAgent: Record<string, { count: number; avgScore: number }> = {};
  const byModel: Record<string, { count: number; avgScore: number; avgCost?: number; avgTokens?: number }> = {};
  const byVariant: Record<string, { count: number; avgScore: number }> = {};
  const agentScoreCounts: Record<string, number> = {};
  const modelScoreCounts: Record<string, number> = {};
  const modelCostCounts: Record<string, number> = {};
  const modelTokenCounts: Record<string, number> = {};
  const variantScoreCounts: Record<string, number> = {};

  for (const o of outcomes) {
    if (!byAgent[o.agent]) byAgent[o.agent] = { count: 0, avgScore: 0 };
    byAgent[o.agent].count++;
    if (o.weightedScore !== undefined) {
      byAgent[o.agent].avgScore += o.weightedScore;
      agentScoreCounts[o.agent] = (agentScoreCounts[o.agent] ?? 0) + 1;
    }

    if (!byModel[o.model]) byModel[o.model] = { count: 0, avgScore: 0 };
    byModel[o.model].count++;
    if (o.weightedScore !== undefined) {
      byModel[o.model].avgScore += o.weightedScore;
      modelScoreCounts[o.model] = (modelScoreCounts[o.model] ?? 0) + 1;
    }
    if (o.costUsd !== undefined) {
      byModel[o.model].avgCost = (byModel[o.model].avgCost ?? 0) + o.costUsd;
      modelCostCounts[o.model] = (modelCostCounts[o.model] ?? 0) + 1;
    }
    if (o.tokensIn !== undefined || o.tokensOut !== undefined) {
      const tokens = (o.tokensIn ?? 0) + (o.tokensOut ?? 0);
      byModel[o.model].avgTokens = (byModel[o.model].avgTokens ?? 0) + tokens;
      modelTokenCounts[o.model] = (modelTokenCounts[o.model] ?? 0) + 1;
    }

    if (o.variantId) {
      if (!byVariant[o.variantId]) byVariant[o.variantId] = { count: 0, avgScore: 0 };
      byVariant[o.variantId].count++;
      if (o.weightedScore !== undefined) {
        byVariant[o.variantId].avgScore += o.weightedScore;
        variantScoreCounts[o.variantId] = (variantScoreCounts[o.variantId] ?? 0) + 1;
      }
    }
  }

  for (const agent of Object.keys(byAgent)) {
    const entry = byAgent[agent];
    const scoreCount = agentScoreCounts[agent] ?? 0;
    entry.avgScore = scoreCount > 0 ? entry.avgScore / scoreCount : 0;
  }
  for (const model of Object.keys(byModel)) {
    const entry = byModel[model];
    const scoreCount = modelScoreCounts[model] ?? 0;
    entry.avgScore = scoreCount > 0 ? entry.avgScore / scoreCount : 0;
    if (entry.avgCost !== undefined) entry.avgCost /= modelCostCounts[model]!;
    if (entry.avgTokens !== undefined) entry.avgTokens /= modelTokenCounts[model]!;
  }
  for (const variant of Object.keys(byVariant)) {
    const entry = byVariant[variant];
    const scoreCount = variantScoreCounts[variant] ?? 0;
    entry.avgScore = scoreCount > 0 ? entry.avgScore / scoreCount : 0;
  }

  return {
    total: outcomes.length,
    passRate: outcomes.length > 0 ? passed.length / outcomes.length : 0,
    avgWeightedScore: Math.round(avgWeightedScore * 1000) / 1000,
    byAgent,
    byModel,
    byVariant,
  };
}

/**
 * Generate unique id for scorecard/outcome.
 */
export function generateEvalId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`;
}
