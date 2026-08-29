import { execFileSync } from 'node:child_process';
import { analyzeDiff } from '../complexity/complexity-auditor';
import { computeCcGain, ccGainToScorecardImpact } from '../complexity/cc-gain';
import type { CriterionId } from './scorecard-constants';
import { createDefaultCriteria } from './scorecard-calculator';
import type { ScorecardCriterionInput } from '../../validation/schemas';

export interface ScorecardSignalHints {
  criteriaOverrides: Partial<
    Record<CriterionId, { score: number; notes?: string; autoSuggested?: boolean }>
  >;
  findings: string[];
}

/**
 * Collect auto-suggested scores from git diff and complexity audit.
 */
export function collectScorecardSignals(
  projectRoot: string,
  scopeFiles?: string[]
): ScorecardSignalHints {
  const findings: string[] = [];
  const overrides: ScorecardSignalHints['criteriaOverrides'] = {};

  let diff = '';
  try {
    diff = execFileSync('git', ['diff', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    findings.push('Could not read git diff; scope audit skipped.');
    return { criteriaOverrides: overrides, findings };
  }

  if (!diff.trim()) {
    overrides.minimal_diff = { score: 2, notes: 'No diff detected', autoSuggested: true };
    return { criteriaOverrides: overrides, findings };
  }

  const changedFiles = new Set<string>();
  for (const line of diff.split('\n')) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) changedFiles.add(m[1]);
  }

  if (scopeFiles && scopeFiles.length > 0) {
    const outOfScope = [...changedFiles].filter(
      (f) => !scopeFiles.some((s) => f.includes(s.replace(/\*\*/g, '')))
    );
    if (outOfScope.length > 0) {
      overrides.minimal_diff = {
        score: 0,
        notes: `Files outside scope: ${outOfScope.slice(0, 5).join(', ')}`,
        autoSuggested: true,
      };
      findings.push(`Scope creep detected in ${outOfScope.length} file(s).`);
    } else {
      overrides.minimal_diff = { score: 2, notes: 'Diff within declared scope', autoSuggested: true };
    }
  }

  try {
    const report = analyzeDiff(diff);
    const gain = computeCcGain(report);
    const ccScore = ccGainToScorecardImpact(gain);
    overrides.cc_gain = {
      score: ccScore,
      notes: `cc-gain raw=${gain.raw}, verdict=${gain.verdict}`,
      autoSuggested: true,
    };
    if (report.findings.length > 0) {
      findings.push(`Complexity auditor: ${report.findings.length} finding(s).`);
    }
  } catch {
    findings.push('Complexity audit skipped.');
  }

  return { criteriaOverrides: overrides, findings };
}

/**
 * Build criteria array merging defaults with signal hints.
 */
export function criteriaFromSignals(hints: ScorecardSignalHints): ScorecardCriterionInput[] {
  return createDefaultCriteria(hints.criteriaOverrides);
}
