import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import type { TaskOutcomeInput } from '../../validation/schemas';
import { aggregateOutcomes, ensureEvaluationDir } from './outcome-store';

export interface CostQualityMatrix {
  generatedAt: string;
  rows: Array<{
    model: string;
    taskCount: number;
    passRate: number;
    avgWeightedScore: number;
    avgTokens?: number;
    avgCostUsd?: number;
  }>;
}

/**
 * Build cost/quality matrix from outcomes and persist to evaluation/matrix.yml
 */
export async function buildCostQualityMatrix(
  projectRoot: string,
  outcomes: TaskOutcomeInput[]
): Promise<CostQualityMatrix> {
  const agg = aggregateOutcomes(outcomes);
  const rows = Object.entries(agg.byModel).map(([model, entry]) => {
    const modelOutcomes = outcomes.filter((o) => o.model === model);
    const passed = modelOutcomes.filter((o) => o.verdict === 'PASS' || o.status === 'pass');
    return {
      model,
      taskCount: entry.count,
      passRate: modelOutcomes.length > 0 ? passed.length / modelOutcomes.length : 0,
      avgWeightedScore: entry.avgScore,
      avgTokens: entry.avgTokens,
      avgCostUsd: entry.avgCost,
    };
  });

  const matrix: CostQualityMatrix = {
    generatedAt: new Date().toISOString(),
    rows,
  };

  const dir = await ensureEvaluationDir(projectRoot);
  await writeFile(resolve(dir, 'matrix.yml'), stringify(matrix), 'utf-8');

  return matrix;
}

export function formatMatrixMarkdown(matrix: CostQualityMatrix): string {
  const lines = [
    '# Cost / Quality Matrix',
    '',
    `Generated: ${matrix.generatedAt}`,
    '',
    '| Model | Tasks | Pass rate | Avg score | Avg tokens | Avg cost USD |',
    '|-------|-------|-----------|-----------|------------|--------------|',
  ];
  for (const row of matrix.rows) {
    lines.push(
      `| ${row.model} | ${row.taskCount} | ${(row.passRate * 100).toFixed(0)}% | ${row.avgWeightedScore.toFixed(2)} | ${row.avgTokens?.toFixed(0) ?? '—'} | ${row.avgCostUsd?.toFixed(4) ?? '—'} |`
    );
  }
  return lines.join('\n');
}
