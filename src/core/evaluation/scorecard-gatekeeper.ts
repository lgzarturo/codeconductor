export interface GatekeeperInput {
  testsPassed: boolean;
  mutationScore: number;
  scopeViolations: number;
  hashValid: boolean;
  mutationThreshold?: number;
}

export type GatekeeperVerdict = 'PASS' | 'REJECT';

export interface GatekeeperResult {
  verdict: GatekeeperVerdict;
  reasons: string[];
  metrics: Record<string, number | boolean>;
}

export function evaluateGate(input: GatekeeperInput): GatekeeperResult {
  const reasons: string[] = [];
  const threshold = input.mutationThreshold ?? 85;

  if (!input.testsPassed) {
    reasons.push('Tests did not pass');
  }

  if (input.mutationScore < threshold) {
    reasons.push(`Mutation test failed: score ${input.mutationScore}% is below the ${threshold}% threshold`);
  }

  if (input.scopeViolations > 0) {
    reasons.push(`Found ${input.scopeViolations} scope violation(s)`);
  }

  if (!input.hashValid) {
    reasons.push('Hash validation failed');
  }

  return {
    verdict: reasons.length === 0 ? 'PASS' : 'REJECT',
    reasons,
    metrics: {
      testsPassed: input.testsPassed,
      mutationScore: input.mutationScore,
      scopeViolations: input.scopeViolations,
      hashValid: input.hashValid,
      mutationThreshold: threshold
    }
  };
}
