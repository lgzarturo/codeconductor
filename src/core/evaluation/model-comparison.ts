import type { TaskOutcomeInput } from '../../validation/schemas';
import { aggregateOutcomes } from './outcome-store';

/**
 * Generate model comparison markdown from outcomes.
 */
export function generateModelComparisonMarkdown(
  outcomes: TaskOutcomeInput[],
  modelsFilter?: string[]
): string {
  const agg = aggregateOutcomes(outcomes);
  const models = modelsFilter ?? Object.keys(agg.byModel);

  const lines = [
    '# Model Comparison Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Model | Tasks | Pass % | Avg score | Avg tokens | Avg cost |',
    '|-------|-------|--------|-----------|------------|----------|',
  ];

  for (const model of models) {
    const entry = agg.byModel[model];
    if (!entry) continue;
    const modelOutcomes = outcomes.filter((o) => o.model === model);
    const passed = modelOutcomes.filter((o) => o.verdict === 'PASS' || o.status === 'pass');
    const passPct = modelOutcomes.length > 0 ? (passed.length / modelOutcomes.length) * 100 : 0;
    lines.push(
      `| ${model} | ${entry.count} | ${passPct.toFixed(0)}% | ${entry.avgScore.toFixed(2)} | ${entry.avgTokens?.toFixed(0) ?? '—'} | ${entry.avgCost?.toFixed(4) ?? '—'} |`
    );
  }

  lines.push('', '## Notes', '', '- Cost and tokens are optional; reported by agents or CLI flags.');
  return lines.join('\n');
}
