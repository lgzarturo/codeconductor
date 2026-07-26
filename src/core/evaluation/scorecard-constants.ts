import type { ScorecardCriterionIdSchema } from '../../validation/schemas';
import type { z } from 'zod';

export type CriterionId = z.infer<typeof ScorecardCriterionIdSchema>;

export const SCORECARD_CRITERIA_DEF: Array<{
  id: CriterionId;
  label: string;
  weight: number;
}> = [
  { id: 'acceptance', label: 'Acceptance criteria met', weight: 0.3 },
  { id: 'minimal_diff', label: 'Minimal diff (no scope creep)', weight: 0.2 },
  { id: 'tests', label: 'Tests present and passing', weight: 0.15 },
  { id: 'regressions', label: 'No regressions introduced', weight: 0.15 },
  { id: 'conventions', label: 'Code follows project conventions', weight: 0.1 },
  { id: 'documentation', label: 'Documentation updated if required', weight: 0.05 },
  { id: 'context_discipline', label: 'Context discipline', weight: 0.05 },
  { id: 'cc_gain', label: 'Complexity diffusion (cc-gain)', weight: 0.05 },
];
