/**
 * Deterministic bench statistics (§3.2): median, IQR, bootstrap CI, Wilson.
 * Pure functions — no I/O. Bootstrap uses a seeded LCG for reproducibility.
 */

export interface SummaryStats {
  n: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  mean: number | null;
}

export interface BootstrapDelta {
  deltaMedian: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  /** True when the 95% CI lies entirely below 0. */
  entirelyBelowZero: boolean;
  /** True when the 95% CI crosses 0. */
  crossesZero: boolean;
  samples: number;
  seed: number;
}

export interface WilsonInterval {
  k: number;
  n: number;
  p: number;
  low: number;
  high: number;
}

/** Seeded LCG (Numerical Recipes). */
export function createLcg(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sortedCopy(values: readonly number[]): number[] {
  return [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

export function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base]!;
  const b = sorted[Math.min(base + 1, sorted.length - 1)]!;
  return a + rest * (b - a);
}

export function summarize(values: readonly number[]): SummaryStats {
  const s = sortedCopy(values);
  const n = s.length;
  if (n === 0) {
    return { n: 0, median: null, q1: null, q3: null, iqr: null, mean: null };
  }
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const median = quantile(s, 0.5);
  const mean = s.reduce((a, b) => a + b, 0) / n;
  return {
    n,
    median,
    q1,
    q3,
    iqr: q1 !== null && q3 !== null ? q3 - q1 : null,
    mean,
  };
}

function resample(
  values: readonly number[],
  rng: () => number,
): number[] {
  if (values.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    out.push(values[Math.floor(rng() * values.length)]!);
  }
  return out;
}

/**
 * Bootstrap 95% CI for median(treatment) − median(baseline).
 * Resamples each arm independently (task-level aggregation is caller's job).
 */
export function bootstrapMedianDelta(
  baseline: readonly number[],
  treatment: readonly number[],
  options: { samples?: number; seed?: number } = {},
): BootstrapDelta {
  const samples = options.samples ?? 10_000;
  const seed = options.seed ?? 42;
  const base = sortedCopy(baseline);
  const treat = sortedCopy(treatment);
  if (base.length === 0 || treat.length === 0) {
    return {
      deltaMedian: null,
      ciLow: null,
      ciHigh: null,
      entirelyBelowZero: false,
      crossesZero: true,
      samples,
      seed,
    };
  }
  const observed =
    (quantile(treat, 0.5) as number) - (quantile(base, 0.5) as number);
  const rng = createLcg(seed);
  const deltas: number[] = [];
  for (let i = 0; i < samples; i++) {
    const bMed = quantile(sortedCopy(resample(base, rng)), 0.5);
    const tMed = quantile(sortedCopy(resample(treat, rng)), 0.5);
    if (bMed === null || tMed === null) continue;
    deltas.push(tMed - bMed);
  }
  deltas.sort((a, b) => a - b);
  const loIdx = Math.floor(0.025 * (deltas.length - 1));
  const hiIdx = Math.ceil(0.975 * (deltas.length - 1));
  const ciLow = deltas[loIdx] ?? null;
  const ciHigh = deltas[hiIdx] ?? null;
  return {
    deltaMedian: observed,
    ciLow,
    ciHigh,
    entirelyBelowZero:
      ciLow !== null && ciHigh !== null && ciHigh < 0,
    crossesZero:
      ciLow !== null && ciHigh !== null && ciLow < 0 && ciHigh > 0,
    samples,
    seed,
  };
}

/** Wilson score interval for a binomial proportion (95%, z≈1.96). */
export function wilsonInterval(k: number, n: number): WilsonInterval {
  if (n <= 0) {
    return { k: 0, n: 0, p: 0, low: 0, high: 1 };
  }
  const z = 1.96;
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return {
    k,
    n,
    p: phat,
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

/**
 * Non-inferiority per task (§3.2): no task may drop from ≥4/5 to ≤2/5.
 */
export function taskNonInferiority(
  baselineK: number,
  baselineN: number,
  treatmentK: number,
  treatmentN: number,
): { ok: boolean; reason: string | null } {
  if (baselineN <= 0 || treatmentN <= 0) {
    return { ok: false, reason: 'missing repetitions' };
  }
  const baseRate = baselineK / baselineN;
  const treatRate = treatmentK / treatmentN;
  if (baseRate >= 4 / 5 && treatRate <= 2 / 5) {
    return {
      ok: false,
      reason: `regression: baseline ${baselineK}/${baselineN} → treatment ${treatmentK}/${treatmentN}`,
    };
  }
  return { ok: true, reason: null };
}
