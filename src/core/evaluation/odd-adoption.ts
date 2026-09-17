export interface OddAdoptionSample {
  readonly id: string;
  readonly route: 'tracked' | 'openspec';
  readonly acceptancePassed: boolean;
  readonly testsPassed: boolean;
  readonly findings: number;
  readonly contextBytes: number;
  readonly costUsd?: number;
}

interface RouteSummary {
  readonly sampleCount: number;
  readonly acceptanceRate: number;
  readonly testPassRate: number;
  readonly averageFindings: number;
  readonly averageContextBytes: number;
}

export interface OddAdoptionEvaluation {
  readonly recommendation: 'eligible' | 'opt-in';
  readonly reason: string;
  readonly reasons: readonly string[];
  readonly baseline: RouteSummary;
  readonly odd: RouteSummary;
  readonly contextReduced: boolean;
  readonly cost: { readonly status: 'reduced' | 'unchanged' | 'increased' | 'unknown' };
}

const DEFAULT_REASON = 'ODD is non-inferior on quality and uses less context.';

export function evaluateOddAdoption(samples: readonly OddAdoptionSample[]): OddAdoptionEvaluation {
  const baselineSamples = samples.filter((sample) => sample.route === 'openspec');
  const oddSamples = samples.filter((sample) => sample.route === 'tracked');
  const baseline = summarize(baselineSamples);
  const odd = summarize(oddSamples);
  const paired = hasPairedSamples(baselineSamples, oddSamples);
  const contextReduced = odd.averageContextBytes < baseline.averageContextBytes;
  const cost = compareCost(baselineSamples, oddSamples);
  const reasons: string[] = [];

  if (!paired) reasons.push('Paired ODD and OpenSpec samples are required.');
  if (odd.acceptanceRate < baseline.acceptanceRate) {
    reasons.push('ODD acceptance rate is below the OpenSpec baseline.');
  }
  if (odd.testPassRate < baseline.testPassRate) {
    reasons.push('ODD test pass rate is below the OpenSpec baseline.');
  }
  if (odd.averageFindings > baseline.averageFindings) {
    reasons.push('ODD average findings exceed the OpenSpec baseline.');
  }
  if (!contextReduced) {
    reasons.push('ODD must reduce average context bytes before it is recommended by default.');
  }
  if (cost.status === 'increased') {
    reasons.push('ODD average measured cost exceeds the OpenSpec baseline.');
  }

  return {
    recommendation: reasons.length === 0 ? 'eligible' : 'opt-in',
    reason: reasons[0] ?? DEFAULT_REASON,
    reasons,
    baseline,
    odd,
    contextReduced,
    cost,
  };
}

function summarize(samples: readonly OddAdoptionSample[]): RouteSummary {
  const count = samples.length;
  return {
    sampleCount: count,
    acceptanceRate: rate(samples.filter((sample) => sample.acceptancePassed).length, count),
    testPassRate: rate(samples.filter((sample) => sample.testsPassed).length, count),
    averageFindings: average(samples.map((sample) => sample.findings)),
    averageContextBytes: average(samples.map((sample) => sample.contextBytes)),
  };
}

function hasPairedSamples(
  baseline: readonly OddAdoptionSample[],
  odd: readonly OddAdoptionSample[]
): boolean {
  if (baseline.length < 2 || baseline.length !== odd.length) return false;
  const baselineIds = new Set(baseline.map((sample) => sample.id));
  const oddIds = new Set(odd.map((sample) => sample.id));
  return (
    baselineIds.size === baseline.length &&
    oddIds.size === odd.length &&
    oddIds.size === baselineIds.size &&
    [...oddIds].every((id) => baselineIds.has(id))
  );
}

function compareCost(
  baseline: readonly OddAdoptionSample[],
  odd: readonly OddAdoptionSample[]
): OddAdoptionEvaluation['cost'] {
  if ([...baseline, ...odd].some((sample) => sample.costUsd === undefined)) {
    return { status: 'unknown' };
  }
  const delta = average(odd.map((sample) => sample.costUsd!)) - average(baseline.map((sample) => sample.costUsd!));
  if (delta < 0) return { status: 'reduced' };
  if (delta > 0) return { status: 'increased' };
  return { status: 'unchanged' };
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function rate(passed: number, total: number): number {
  return total === 0 ? 0 : passed / total;
}
