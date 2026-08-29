import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  HarnessComponentIdInput,
  ScorecardCriterionInput,
  TaskOutcomeInput,
} from '../../validation/schemas';
import { EVAL_DIR, catalogIds, parseVariantId } from './harness-catalog';
import { loadScorecard } from './outcome-store';

export const SCORE_THRESHOLD = 0.1;
export const PASS_RATE_THRESHOLD = 0.05;

export type AblationVerdict = 'improves' | 'degrades' | 'no_change';

export interface AblationMetrics {
  count: number;
  avgScore: number;
  passRate: number;
  avgCost?: number;
  avgDurationMs?: number;
  criteria?: Partial<Record<string, number>>;
}

export interface AblationComponentRow {
  component: HarnessComponentIdInput;
  variantId: string;
  baseline: AblationMetrics;
  treatment: AblationMetrics;
  deltaScore: number;
  deltaPassRate: number;
  deltaCost?: number;
  deltaDurationMs?: number;
  deltaCriteria: Record<string, number>;
  verdict: AblationVerdict;
}

export interface AblationReport {
  generatedAt: string;
  experimentId?: string;
  outcomeCount: number;
  pairedCount: number;
  rows: AblationComponentRow[];
}

function isPass(o: TaskOutcomeInput): boolean {
  return o.verdict === 'PASS' || o.status === 'pass';
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function metricsFrom(outcomes: TaskOutcomeInput[], criteria?: Partial<Record<string, number>>): AblationMetrics {
  const scores = outcomes.map((o) => o.weightedScore).filter((n): n is number => n !== undefined);
  const costs = outcomes.map((o) => o.costUsd).filter((n): n is number => n !== undefined);
  const durations = outcomes.map((o) => o.durationMs).filter((n): n is number => n !== undefined);
  return {
    count: outcomes.length,
    avgScore: mean(scores) ?? 0,
    passRate: outcomes.length > 0 ? outcomes.filter(isPass).length / outcomes.length : 0,
    avgCost: mean(costs),
    avgDurationMs: mean(durations),
    criteria,
  };
}

export function classifyAblation(deltaScore: number, deltaPassRate: number): AblationVerdict {
  const scoreNeutral = Math.abs(deltaScore) < SCORE_THRESHOLD;
  const passNeutral = Math.abs(deltaPassRate) < PASS_RATE_THRESHOLD;
  if (scoreNeutral && passNeutral) return 'no_change';
  if (deltaScore <= -SCORE_THRESHOLD) return 'degrades';
  if (deltaScore >= SCORE_THRESHOLD) return 'improves';
  if (deltaPassRate <= -PASS_RATE_THRESHOLD) return 'degrades';
  if (deltaPassRate >= PASS_RATE_THRESHOLD) return 'improves';
  return 'no_change';
}

async function averageCriteria(
  projectRoot: string,
  outcomes: TaskOutcomeInput[]
): Promise<Partial<Record<string, number>> | undefined> {
  const buckets: Record<string, number[]> = {};
  for (const o of outcomes) {
    if (!o.scorecardId) continue;
    const loaded = await loadScorecard(projectRoot, o.scorecardId);
    if (!loaded.success) continue;
    for (const c of loaded.data.criteria as ScorecardCriterionInput[]) {
      if (!buckets[c.id]) buckets[c.id] = [];
      buckets[c.id].push(c.score);
    }
  }
  const ids = Object.keys(buckets);
  if (ids.length === 0) return undefined;
  const avg: Partial<Record<string, number>> = {};
  for (const id of ids) {
    avg[id] = mean(buckets[id]!) ?? 0;
  }
  return avg;
}

export async function buildAblationReport(
  projectRoot: string,
  outcomes: TaskOutcomeInput[],
  experimentId?: string
): Promise<AblationReport> {
  const scoped = experimentId ? outcomes.filter((o) => o.experimentId === experimentId) : outcomes.filter((o) => o.variantId);
  const byComponent = new Map<HarnessComponentIdInput, { baseline: TaskOutcomeInput[]; treatment: TaskOutcomeInput[] }>();

  const keyOf = (o: TaskOutcomeInput) => o.suiteTaskId ?? o.taskId;
  const treatmentIds = (o: TaskOutcomeInput): HarnessComponentIdInput[] => {
    const fromField = o.disabledComponents?.filter((id) =>
      catalogIds().includes(id as HarnessComponentIdInput)
    ) as HarnessComponentIdInput[] | undefined;
    if (fromField && fromField.length > 0) return fromField;
    return parseVariantId(o.variantId ?? '');
  };

  const baselines = scoped.filter((o) => o.variantId === 'baseline');
  const treatments = scoped.filter((o) => o.variantId && o.variantId !== 'baseline');
  const baselineKeys = new Set(baselines.map(keyOf));

  for (const o of treatments) {
    const ids = treatmentIds(o);
    const hasPair = baselineKeys.has(keyOf(o)) || baselines.length > 0;
    if (!hasPair) continue;
    for (const id of ids) {
      if (!byComponent.has(id)) byComponent.set(id, { baseline: [], treatment: [] });
      byComponent.get(id)!.treatment.push(o);
    }
  }

  for (const [id, pair] of byComponent) {
    const treatmentKeys = new Set(pair.treatment.map(keyOf));
    const pairedBaselines = baselines.filter((o) => treatmentKeys.has(keyOf(o)));
    pair.baseline = pairedBaselines.length > 0 ? pairedBaselines : baselines;
    void id;
  }

  const rows: AblationComponentRow[] = [];
  for (const id of catalogIds()) {
    const pair = byComponent.get(id);
    if (!pair || pair.treatment.length === 0 || pair.baseline.length === 0) continue;

    const baselineCriteria = await averageCriteria(projectRoot, pair.baseline);
    const treatmentCriteria = await averageCriteria(projectRoot, pair.treatment);
    const baseline = metricsFrom(pair.baseline, baselineCriteria);
    const treatment = metricsFrom(pair.treatment, treatmentCriteria);
    const deltaScore = treatment.avgScore - baseline.avgScore;
    const deltaPassRate = treatment.passRate - baseline.passRate;
    const deltaCriteria: Record<string, number> = {};
    const criterionIds = new Set([
      ...Object.keys(baseline.criteria ?? {}),
      ...Object.keys(treatment.criteria ?? {}),
    ]);
    for (const cid of criterionIds) {
      deltaCriteria[cid] = (treatment.criteria?.[cid] ?? 0) - (baseline.criteria?.[cid] ?? 0);
    }

    rows.push({
      component: id,
      variantId: `minus:${id}`,
      baseline,
      treatment,
      deltaScore: Math.round(deltaScore * 1000) / 1000,
      deltaPassRate: Math.round(deltaPassRate * 1000) / 1000,
      deltaCost:
        baseline.avgCost !== undefined && treatment.avgCost !== undefined
          ? Math.round((treatment.avgCost - baseline.avgCost) * 10000) / 10000
          : undefined,
      deltaDurationMs:
        baseline.avgDurationMs !== undefined && treatment.avgDurationMs !== undefined
          ? Math.round(treatment.avgDurationMs - baseline.avgDurationMs)
          : undefined,
      deltaCriteria,
      verdict: classifyAblation(deltaScore, deltaPassRate),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    experimentId,
    outcomeCount: scoped.length,
    pairedCount: rows.reduce((s, r) => s + Math.min(r.baseline.count, r.treatment.count), 0),
    rows,
  };
}

export function formatAblationMarkdown(report: AblationReport): string {
  const lines = [
    '# Harness Ablation Report',
    '',
    `Generated: ${report.generatedAt}`,
    report.experimentId ? `Experiment: ${report.experimentId}` : 'Experiment: (all tagged outcomes)',
    `Outcomes: ${report.outcomeCount}`,
    '',
    '| Component | Verdict | Δ score | Δ pass | Δ cost | Δ duration | Baseline n | Treatment n |',
    '|-----------|---------|---------|--------|--------|------------|------------|-------------|',
  ];
  for (const row of report.rows) {
    lines.push(
      `| ${row.component} | ${row.verdict} | ${row.deltaScore.toFixed(2)} | ${(row.deltaPassRate * 100).toFixed(0)}pp | ${row.deltaCost?.toFixed(4) ?? '—'} | ${row.deltaDurationMs ?? '—'} | ${row.baseline.count} | ${row.treatment.count} |`
    );
  }
  if (report.rows.length === 0) {
    lines.push('| — | — | — | — | — | — | — | — |');
    lines.push('', 'No paired baseline/treatment outcomes yet.');
  } else {
    lines.push('', '## Criterion deltas', '');
    for (const row of report.rows) {
      const keys = Object.keys(row.deltaCriteria);
      if (keys.length === 0) continue;
      lines.push(`### minus:${row.component}`);
      for (const key of keys) {
        const delta = row.deltaCriteria[key] ?? 0;
        lines.push(`- ${key}: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
      }
      lines.push('');
    }
    lines.push('## How to read', '');
    lines.push(
      `- \`improves\`: removing the component raised score by ≥ ${SCORE_THRESHOLD} or pass rate by ≥ ${PASS_RATE_THRESHOLD * 100}pp.`
    );
    lines.push(
      `- \`degrades\`: removing the component lowered score by ≥ ${SCORE_THRESHOLD} or pass rate by ≥ ${PASS_RATE_THRESHOLD * 100}pp.`
    );
    lines.push(`- \`no_change\`: both deltas stay inside those thresholds.`);
  }
  return lines.join('\n');
}

export async function persistAblationReport(projectRoot: string, markdown: string): Promise<string> {
  const dir = resolve(projectRoot, EVAL_DIR);
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, 'ablation-last.md');
  await writeFile(path, markdown, 'utf-8');
  return path;
}
