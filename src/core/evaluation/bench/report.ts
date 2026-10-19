/**
 * Bench comparative report (§3.4) — markdown + JSON.
 * Format inspired by formatAblationMarkdown.
 */
import { createHash } from 'node:crypto';
import {
  bootstrapMedianDelta,
  summarize,
  taskNonInferiority,
  wilsonInterval,
  type BootstrapDelta,
  type SummaryStats,
  type WilsonInterval,
} from './stats';

export type BenchVerdict = 'ACEPTA' | 'RECHAZA' | 'NO CONCLUYENTE';
export type BenchClaim = 'efficiency' | 'quality' | 'success-only';

export interface BenchRunCell {
  taskId: string;
  variant: 'baseline' | 'treatment';
  repetition: number;
  success: boolean;
  iterations: number | null;
  retries: number | null;
  calls: number | null;
  tokensTotal: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensCacheRead: number | null;
  tokensCacheWrite: number | null;
  costUsd: number | null;
  durationMs: number | null;
  cacheHitRate: number | null;
  firstTry: boolean | null;
  modelId: string | null;
  hostVersion: string | null;
}

export interface BenchFingerprints {
  harness: string | null;
  prompt: string | null;
  host: string | null;
  model: string | null;
  pricingVersion: string | null;
}

export interface BenchTaskRow {
  taskId: string;
  baseline: SummaryStats;
  treatment: SummaryStats;
  deltaMedian: number | null;
  bootstrap: BootstrapDelta;
  baselineSuccess: WilsonInterval;
  treatmentSuccess: WilsonInterval;
  nonInferiorityOk: boolean;
  metric: 'tokensTotal' | 'iterations' | 'durationMs';
}

export interface BenchReport {
  schema: 'bench-report/v1';
  generatedAt: string;
  timezone: string;
  suiteId: string;
  n: number;
  cheap: boolean;
  claim: BenchClaim;
  efficiencyThreshold: number;
  qualityTokenCeiling: number;
  verdict: BenchVerdict;
  verdictReasons: string[];
  fingerprints: BenchFingerprints;
  totalCostUsd: number | null;
  tasks: BenchTaskRow[];
  overall: {
    baselineSuccess: WilsonInterval;
    treatmentSuccess: WilsonInterval;
    tokens: BenchTaskRow;
  };
  cells: BenchRunCell[];
  /** sha256 of canonical JSON (cells + fingerprints + suite + n) for freeze. */
  contentHash: string;
}

export interface BuildBenchReportInput {
  suiteId: string;
  cells: BenchRunCell[];
  fingerprints?: Partial<BenchFingerprints>;
  claim?: BenchClaim;
  cheap?: boolean;
  /** Override minimum N (default: 3 cheap / 5 normal). */
  minN?: number;
  efficiencyThreshold?: number;
  qualityTokenCeiling?: number;
  bootstrapSamples?: number;
  seed?: number;
  metric?: 'tokensTotal' | 'iterations' | 'durationMs';
  generatedAt?: string;
}

function valuesFor(
  cells: readonly BenchRunCell[],
  variant: 'baseline' | 'treatment',
  taskId: string | null,
  metric: 'tokensTotal' | 'iterations' | 'durationMs',
): number[] {
  return cells
    .filter((c) => c.variant === variant && (taskId === null || c.taskId === taskId))
    .map((c) => c[metric])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function successCounts(
  cells: readonly BenchRunCell[],
  variant: 'baseline' | 'treatment',
  taskId: string | null,
): { k: number; n: number } {
  const scoped = cells.filter(
    (c) => c.variant === variant && (taskId === null || c.taskId === taskId),
  );
  return {
    k: scoped.filter((c) => c.success).length,
    n: scoped.length,
  };
}

function buildTaskRow(
  cells: readonly BenchRunCell[],
  taskId: string | null,
  metric: 'tokensTotal' | 'iterations' | 'durationMs',
  seed: number,
  samples: number,
): BenchTaskRow {
  const baselineVals = valuesFor(cells, 'baseline', taskId, metric);
  const treatmentVals = valuesFor(cells, 'treatment', taskId, metric);
  const baseline = summarize(baselineVals);
  const treatment = summarize(treatmentVals);
  const bootstrap = bootstrapMedianDelta(baselineVals, treatmentVals, { seed, samples });
  const bSucc = successCounts(cells, 'baseline', taskId);
  const tSucc = successCounts(cells, 'treatment', taskId);
  const ni =
    taskId === null
      ? { ok: true, reason: null }
      : taskNonInferiority(bSucc.k, bSucc.n, tSucc.k, tSucc.n);
  return {
    taskId: taskId ?? '_overall',
    baseline,
    treatment,
    deltaMedian: bootstrap.deltaMedian,
    bootstrap,
    baselineSuccess: wilsonInterval(bSucc.k, bSucc.n),
    treatmentSuccess: wilsonInterval(tSucc.k, tSucc.n),
    nonInferiorityOk: ni.ok,
    metric,
  };
}

/** Minimum repetitions per cell: 3 in cheap mode, 5 otherwise (§3.1 / review). */
export function minRepetitionsForMode(cheap: boolean): number {
  return cheap ? 3 : 5;
}

function decideVerdict(
  claim: BenchClaim,
  overall: BenchReport['overall'],
  tasks: BenchTaskRow[],
  efficiencyThreshold: number,
  qualityTokenCeiling: number,
  n: number,
  minN: number,
): { verdict: BenchVerdict; reasons: string[] } {
  const reasons: string[] = [];
  const successOk =
    overall.treatmentSuccess.p >= overall.baselineSuccess.p &&
    tasks.every((t) => t.nonInferiorityOk);

  if (!successOk) {
    reasons.push('success criterion failed (rate or per-task non-inferiority)');
    return { verdict: 'RECHAZA', reasons };
  }
  reasons.push('success criterion met');

  // Low N degenerates the bootstrap IC (ciLow≈ciHigh) and can falsely ACEPTA.
  if (!Number.isFinite(n) || n < minN) {
    reasons.push(
      `N=${n} below minimum ${minN} for this mode — IC unreliable (NO CONCLUYENTE)`,
    );
    return { verdict: 'NO CONCLUYENTE', reasons };
  }

  if (claim === 'success-only') {
    return { verdict: 'ACEPTA', reasons };
  }

  const delta = overall.tokens.bootstrap;
  if (delta.deltaMedian === null || delta.ciLow === null || delta.ciHigh === null) {
    reasons.push('insufficient token samples for efficiency/quality IC');
    return { verdict: 'NO CONCLUYENTE', reasons };
  }

  if (claim === 'efficiency') {
    const target = -(efficiencyThreshold) * (overall.tokens.baseline.median ?? 0);
    // Prefer relative: treatment median ≤ baseline * (1 - X%)
    const baseMed = overall.tokens.baseline.median ?? 0;
    const treatMed = overall.tokens.treatment.median ?? 0;
    const improved = baseMed > 0 && treatMed <= baseMed * (1 - efficiencyThreshold);
    if (delta.crossesZero) {
      reasons.push('efficiency IC crosses 0');
      return { verdict: 'NO CONCLUYENTE', reasons };
    }
    if (improved && delta.entirelyBelowZero) {
      reasons.push(
        `efficiency: tokens −≥${(efficiencyThreshold * 100).toFixed(0)}% and IC < 0`,
      );
      return { verdict: 'ACEPTA', reasons };
    }
    reasons.push(
      `efficiency not met (Δ median=${delta.deltaMedian}, target≈${target.toFixed(1)})`,
    );
    return { verdict: 'RECHAZA', reasons };
  }

  // quality: tokens may rise ≤ Y%, success already ok
  const baseMed = overall.tokens.baseline.median ?? 0;
  const treatMed = overall.tokens.treatment.median ?? 0;
  const riseOk =
    baseMed <= 0 || treatMed <= baseMed * (1 + qualityTokenCeiling);
  if (!riseOk) {
    reasons.push(
      `quality: token rise exceeds ${(qualityTokenCeiling * 100).toFixed(0)}% ceiling`,
    );
    return { verdict: 'RECHAZA', reasons };
  }
  if (delta.crossesZero && treatMed > baseMed) {
    reasons.push('quality: token delta IC inconclusive while tokens rose');
    return { verdict: 'NO CONCLUYENTE', reasons };
  }
  reasons.push(
    `quality: tokens within +${(qualityTokenCeiling * 100).toFixed(0)}% and success ok`,
  );
  return { verdict: 'ACEPTA', reasons };
}

export function canonicalBenchHash(input: {
  suiteId: string;
  n: number;
  cells: BenchRunCell[];
  fingerprints: BenchFingerprints;
}): string {
  const payload = JSON.stringify({
    suiteId: input.suiteId,
    n: input.n,
    fingerprints: input.fingerprints,
    cells: [...input.cells].sort((a, b) =>
      `${a.variant}:${a.taskId}:${a.repetition}`.localeCompare(
        `${b.variant}:${b.taskId}:${b.repetition}`,
      ),
    ),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function buildBenchReport(input: BuildBenchReportInput): BenchReport {
  const metric = input.metric ?? 'tokensTotal';
  const seed = input.seed ?? 42;
  const samples = input.bootstrapSamples ?? 10_000;
  const claim = input.claim ?? 'success-only';
  const efficiencyThreshold = input.efficiencyThreshold ?? 0.1;
  const qualityTokenCeiling = input.qualityTokenCeiling ?? 0.15;
  const fingerprints: BenchFingerprints = {
    harness: input.fingerprints?.harness ?? null,
    prompt: input.fingerprints?.prompt ?? null,
    host: input.fingerprints?.host ?? null,
    model: input.fingerprints?.model ?? null,
    pricingVersion: input.fingerprints?.pricingVersion ?? null,
  };

  const taskIds = [...new Set(input.cells.map((c) => c.taskId))].sort();
  const tasks = taskIds.map((id) =>
    buildTaskRow(input.cells, id, metric, seed, samples),
  );
  const overallTokens = buildTaskRow(input.cells, null, metric, seed, samples);
  const bSucc = successCounts(input.cells, 'baseline', null);
  const tSucc = successCounts(input.cells, 'treatment', null);
  const overall = {
    baselineSuccess: wilsonInterval(bSucc.k, bSucc.n),
    treatmentSuccess: wilsonInterval(tSucc.k, tSucc.n),
    tokens: overallTokens,
  };

  const costs = input.cells
    .map((c) => c.costUsd)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const totalCostUsd =
    costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0);

  const n =
    Math.max(
      0,
      ...input.cells.map((c) => c.repetition),
    ) || input.cells.filter((c) => c.variant === 'baseline').length /
      Math.max(1, taskIds.length);
  const nRounded = Math.round(n);
  const cheap = input.cheap === true;
  const minN = input.minN ?? minRepetitionsForMode(cheap);

  const { verdict, reasons } = decideVerdict(
    claim,
    overall,
    tasks,
    efficiencyThreshold,
    qualityTokenCeiling,
    nRounded,
    minN,
  );

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const contentHash = canonicalBenchHash({
    suiteId: input.suiteId,
    n: nRounded,
    cells: input.cells,
    fingerprints,
  });

  return {
    schema: 'bench-report/v1',
    generatedAt,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    suiteId: input.suiteId,
    n: nRounded,
    cheap,
    claim,
    efficiencyThreshold,
    qualityTokenCeiling,
    verdict,
    verdictReasons: reasons,
    fingerprints,
    totalCostUsd,
    tasks,
    overall,
    cells: input.cells,
    contentHash,
  };
}

export function formatBenchReportMarkdown(report: BenchReport): string {
  const lines = [
    '# Bench Report',
    '',
    `Generated: ${report.generatedAt} (${report.timezone})`,
    `Suite: \`${report.suiteId}\` · N=${report.n} · cheap=${report.cheap}`,
    `Claim: ${report.claim}`,
    `Verdict: **${report.verdict}**`,
    `Hash: \`${report.contentHash}\``,
    '',
    '## Reasons',
    '',
    ...report.verdictReasons.map((r) => `- ${r}`),
    '',
    '## Fingerprints',
    '',
    `- harness: \`${report.fingerprints.harness ?? 'n/a'}\``,
    `- prompt: \`${report.fingerprints.prompt ?? 'n/a'}\``,
    `- host: \`${report.fingerprints.host ?? 'n/a'}\``,
    `- model: \`${report.fingerprints.model ?? 'n/a'}\``,
    `- pricing: \`${report.fingerprints.pricingVersion ?? 'n/a'}\``,
    '',
    `Total cost (sum of cells): ${report.totalCostUsd ?? 'n/a'}`,
    '',
    '## Per-task tokens (median [IQR])',
    '',
    '| Task | Baseline | Treatment | Δ median | IC 95% | Success B→T | NI |',
    '| --- | --- | --- | ---: | --- | --- | --- |',
  ];
  for (const t of report.tasks) {
    const b = t.baseline;
    const tr = t.treatment;
    const fmt = (s: SummaryStats) =>
      s.median === null
        ? '—'
        : `${s.median.toFixed(1)} [${s.q1?.toFixed(1) ?? '—'}, ${s.q3?.toFixed(1) ?? '—'}]`;
    const ci =
      t.bootstrap.ciLow === null
        ? '—'
        : `[${t.bootstrap.ciLow.toFixed(1)}, ${t.bootstrap.ciHigh?.toFixed(1)}]`;
    lines.push(
      `| ${t.taskId} | ${fmt(b)} | ${fmt(tr)} | ${t.deltaMedian?.toFixed(1) ?? '—'} | ${ci} | ${t.baselineSuccess.k}/${t.baselineSuccess.n}→${t.treatmentSuccess.k}/${t.treatmentSuccess.n} | ${t.nonInferiorityOk ? 'ok' : 'FAIL'} |`,
    );
  }
  const o = report.overall.tokens;
  lines.push(
    `| TOTAL | ${o.baseline.median?.toFixed(1) ?? '—'} | ${o.treatment.median?.toFixed(1) ?? '—'} | ${o.deltaMedian?.toFixed(1) ?? '—'} | [${o.bootstrap.ciLow?.toFixed(1) ?? '—'}, ${o.bootstrap.ciHigh?.toFixed(1) ?? '—'}] | ${report.overall.baselineSuccess.k}/${report.overall.baselineSuccess.n}→${report.overall.treatmentSuccess.k}/${report.overall.treatmentSuccess.n} | — |`,
  );
  lines.push('');
  return lines.join('\n');
}
