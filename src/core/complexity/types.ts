export type AuditorSeverity = 'info' | 'warning' | 'critical';

export type BloatPattern =
  | 'single-implementation-interface'
  | 'trivial-wrapper'
  | 'one-method-class'
  | 'unused-import'
  | 'external-dep-for-native'
  | 'excessive-abstraction'
  | 'dead-code'; // TODO: not yet implemented

export type FindingAction = 'delete' | 'replace-native';

export interface DepChange {
  name: string;
  type: 'runtime' | 'dev' | 'import';
  file?: string;
}

export interface ComplexityFinding {
  severity: AuditorSeverity;
  pattern: BloatPattern;
  file: string;
  line?: number;
  message: string;
  action: FindingAction;
}

export interface ComplexityAuditReport {
  locAdded: number;
  locRemoved: number;
  locDelta: number;
  depsAdded: DepChange[];
  depsRemoved: DepChange[];
  depsDelta: number;
  cyclomaticAdded: number;
  cyclomaticRemoved: number;
  cyclomaticDelta: number;
  findings: ComplexityFinding[];
}

export interface CcGainResult {
  raw: number;
  normalized: number;
  verdict: 'positive' | 'neutral' | 'negative';
  breakdown: {
    locContribution: number;
    depContribution: number;
    complexityContribution: number;
    abstractionPenalty: number;
  };
}
