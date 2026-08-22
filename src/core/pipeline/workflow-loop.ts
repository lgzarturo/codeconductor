import { execSync } from 'node:child_process';
import { councilConsensus } from '../../domain/council/council-consensus';
import type {
  ConsensusConfig,
  CouncilVerdictInput,
  CouncilVerdict,
} from '../../domain/council/council-consensus';

export interface TaskCard {
  title: string;
  type: 'feature' | 'fix' | 'refactor' | 'review' | 'docs' | 'test';
  risk: 'low' | 'medium' | 'high';
  scope: {
    in: string[];
    out: string[];
  };
  context: string;
  acceptanceCriteria: string[];
  constraints: string[];
}

export interface TechnicalPlan {
  approach: string;
  filesAffected: string[];
  edgeCaseMatrix: Array<{ scenario: string; expected: string }>;
}

export interface ValidationReport {
  mutationScore: number;
  diffAuditPassed: boolean;
  survivingMutants: string[];
}

export interface PipelineCallbacks {
  // Phase 1: Intake
  runIntake: (rawRequest: string) => Promise<TaskCard>;
  // Phase 2: Structure
  runStructure: (card: TaskCard) => Promise<TaskCard>;
  // Phase 3: Design
  runDesign: (card: TaskCard) => Promise<TechnicalPlan>;
  // Phase 4: Test
  runTest: (plan: TechnicalPlan) => Promise<{ testsWritten: number; suiteFails: boolean }>;
  // Phase 5: Implement
  runImplement: (plan: TechnicalPlan, tddFeedback?: string) => Promise<{ codeWritten: boolean; testsPass: boolean }>;
  // Phase 6: Validate
  runValidate: (plan: TechnicalPlan) => Promise<ValidationReport>;
  // Phase 7: Council Verdict
  runCouncilReview: (plan: TechnicalPlan, validation: ValidationReport) => Promise<CouncilVerdictInput[]>;
  // Phase 8: Compact
  runCompact: (card: TaskCard, summary: string) => Promise<void>;
  
  // STOP Gates
  onStopGate: (phase: number, data: any) => Promise<'APPROVE' | 'REJECT' | 'ESCALATE'>;
}

export interface PipelineConfig {
  maxWallClockSeconds?: number;
  maxFilesModified?: number;
  maxLinesChanged?: number;
  cwd?: string;
  councilConfig?: ConsensusConfig;
  callbacks: PipelineCallbacks;
}

export interface PipelineResult {
  success: boolean;
  phase: 'INTAKE' | 'STRUCTURE' | 'DESIGN' | 'TEST' | 'IMPLEMENT' | 'VALIDATE' | 'COUNCIL' | 'COMPACT' | 'DONE';
  error?: string;
  taskCard?: TaskCard;
  technicalPlan?: TechnicalPlan;
  verdict?: CouncilVerdict;
}

// Git helpers specific to pipeline checks
function getModifiedFilesCount(cwd?: string): number {
  try {
    const output = execSync('git status --porcelain', {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

function getLinesChangedCount(cwd?: string): number {
  try {
    const output = execSync('git diff --numstat', {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let total = 0;
    const lines = output.split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const added = parseInt(parts[0] || '0', 10);
      const deleted = parseInt(parts[1] || '0', 10);
      if (!isNaN(added)) total += added;
      if (!isNaN(deleted)) total += deleted;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Execute the experimental 8-phase multi-agent workflow loop.
 *
 * Library-only today — not wired as a shipped CLI runtime. Prefer CCEP
 * profiles and slash-command workflows for production orchestration.
 */
export async function runWorkflowPipeline(
  rawRequest: string,
  config: PipelineConfig,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const { callbacks, maxWallClockSeconds = 0, maxFilesModified = 0, maxLinesChanged = 0, cwd } = config;

  const checkTimeout = (phase: PipelineResult['phase']): PipelineResult | null => {
    if (maxWallClockSeconds > 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > maxWallClockSeconds) {
        return {
          success: false,
          phase,
          error: `Timeout guardrail triggered: elapsed time ${elapsed.toFixed(1)}s exceeded limit of ${maxWallClockSeconds}s`,
        };
      }
    }
    return null;
  };

  const checkGitGuardrails = (phase: PipelineResult['phase']): PipelineResult | null => {
    if (maxFilesModified > 0) {
      const modified = getModifiedFilesCount(cwd);
      if (modified > maxFilesModified) {
        return {
          success: false,
          phase,
          error: `Files modified guardrail triggered: ${modified} files changed exceeded limit of ${maxFilesModified}`,
        };
      }
    }
    if (maxLinesChanged > 0) {
      const changed = getLinesChangedCount(cwd);
      if (changed > maxLinesChanged) {
        return {
          success: false,
          phase,
          error: `Lines changed guardrail triggered: ${changed} lines changed exceeded limit of ${maxLinesChanged}`,
        };
      }
    }
    return null;
  };

  let timeoutErr = checkTimeout('INTAKE');
  if (timeoutErr) return timeoutErr;

  // Phase 1: Intake
  let taskCard: TaskCard;
  try {
    taskCard = await callbacks.runIntake(rawRequest);
  } catch (e) {
    return { success: false, phase: 'INTAKE', error: String(e) };
  }

  timeoutErr = checkTimeout('STRUCTURE');
  if (timeoutErr) return timeoutErr;

  // Phase 2: Structure
  let compactedCard: TaskCard;
  try {
    compactedCard = await callbacks.runStructure(taskCard);
  } catch (e) {
    return { success: false, phase: 'STRUCTURE', error: String(e), taskCard };
  }

  timeoutErr = checkTimeout('DESIGN');
  if (timeoutErr) return timeoutErr;

  // Phase 3: Design
  let plan: TechnicalPlan;
  try {
    plan = await callbacks.runDesign(compactedCard);
  } catch (e) {
    return { success: false, phase: 'DESIGN', error: String(e), taskCard: compactedCard };
  }

  // STOP Gate after Design
  try {
    const decision = await callbacks.onStopGate(3, plan);
    if (decision !== 'APPROVE') {
      return {
        success: false,
        phase: 'DESIGN',
        error: `STOP Gate at Phase 3 (Design) rejected with status: ${decision}`,
        taskCard: compactedCard,
        technicalPlan: plan,
      };
    }
  } catch (e) {
    return { success: false, phase: 'DESIGN', error: `STOP Gate error: ${String(e)}`, taskCard: compactedCard, technicalPlan: plan };
  }

  timeoutErr = checkTimeout('TEST');
  if (timeoutErr) return timeoutErr;

  // Phase 4: Test (RED)
  try {
    const testResult = await callbacks.runTest(plan);
    if (!testResult.suiteFails) {
      return {
        success: false,
        phase: 'TEST',
        error: `TDD Red Phase violation: written tests did not fail as expected`,
        taskCard: compactedCard,
        technicalPlan: plan,
      };
    }
  } catch (e) {
    return { success: false, phase: 'TEST', error: String(e), taskCard: compactedCard, technicalPlan: plan };
  }

  timeoutErr = checkTimeout('IMPLEMENT');
  if (timeoutErr) return timeoutErr;

  // Phase 5: Implement (GREEN)
  try {
    let loopIter = 0;
    let greenPass = false;
    let tddFeedback: string | undefined;

    while (loopIter < 3 && !greenPass) {
      loopIter++;
      const implResult = await callbacks.runImplement(plan, tddFeedback);
      
      const gitErr = checkGitGuardrails('IMPLEMENT');
      if (gitErr) return gitErr;

      if (implResult.testsPass) {
        greenPass = true;
      } else {
        tddFeedback = `Test suite run failed during implement loop iteration ${loopIter}.`;
      }
    }

    if (!greenPass) {
      return {
        success: false,
        phase: 'IMPLEMENT',
        error: `TDD Green Phase failed: unable to pass tests after 3 iterations`,
        taskCard: compactedCard,
        technicalPlan: plan,
      };
    }
  } catch (e) {
    return { success: false, phase: 'IMPLEMENT', error: String(e), taskCard: compactedCard, technicalPlan: plan };
  }

  timeoutErr = checkTimeout('VALIDATE');
  if (timeoutErr) return timeoutErr;

  // Phase 6: Validate (Mutation + Scope Audit)
  let validationReport: ValidationReport;
  try {
    validationReport = await callbacks.runValidate(plan);
    if (validationReport.mutationScore < 80) {
      return {
        success: false,
        phase: 'VALIDATE',
        error: `Mutation test failed: score ${validationReport.mutationScore}% is below the 80% threshold`,
        taskCard: compactedCard,
        technicalPlan: plan,
      };
    }
    if (!validationReport.diffAuditPassed) {
      return {
        success: false,
        phase: 'VALIDATE',
        error: `Diff scope audit failed: modifications outside of technical plan boundaries detected`,
        taskCard: compactedCard,
        technicalPlan: plan,
      };
    }
  } catch (e) {
    return { success: false, phase: 'VALIDATE', error: String(e), taskCard: compactedCard, technicalPlan: plan };
  }

  timeoutErr = checkTimeout('COUNCIL');
  if (timeoutErr) return timeoutErr;

  // Phase 7: Council Verdict
  let consensusVerdict: CouncilVerdict;
  try {
    const individualVerdicts = await callbacks.runCouncilReview(plan, validationReport);
    consensusVerdict = config.councilConfig
      ? councilConsensus(individualVerdicts, config.councilConfig)
      : councilConsensus(individualVerdicts);

    if (consensusVerdict.status === 'REJECTED') {
      return {
        success: false,
        phase: 'COUNCIL',
        error: `Council rejected the changes. Summary: ${consensusVerdict.summary}`,
        taskCard: compactedCard,
        technicalPlan: plan,
        verdict: consensusVerdict,
      };
    }
    if (consensusVerdict.status === 'ESCALATED') {
      return {
        success: false,
        phase: 'COUNCIL',
        error: `Council escalated the verdict. Summary: ${consensusVerdict.summary}`,
        taskCard: compactedCard,
        technicalPlan: plan,
        verdict: consensusVerdict,
      };
    }
  } catch (e) {
    return { success: false, phase: 'COUNCIL', error: String(e), taskCard: compactedCard, technicalPlan: plan };
  }

  // STOP Gate after Council Verdict
  try {
    const decision = await callbacks.onStopGate(7, consensusVerdict);
    if (decision !== 'APPROVE') {
      return {
        success: false,
        phase: 'COUNCIL',
        error: `STOP Gate at Phase 7 (Verdict) rejected with status: ${decision}`,
        taskCard: compactedCard,
        technicalPlan: plan,
        verdict: consensusVerdict,
      };
    }
  } catch (e) {
    return {
      success: false,
      phase: 'COUNCIL',
      error: `STOP Gate error: ${String(e)}`,
      taskCard: compactedCard,
      technicalPlan: plan,
      verdict: consensusVerdict,
    };
  }

  timeoutErr = checkTimeout('COMPACT');
  if (timeoutErr) return timeoutErr;

  // Phase 8: Compact
  try {
    await callbacks.runCompact(compactedCard, consensusVerdict.summary);
  } catch (e) {
    return {
      success: false,
      phase: 'COMPACT',
      error: String(e),
      taskCard: compactedCard,
      technicalPlan: plan,
      verdict: consensusVerdict,
    };
  }

  return {
    success: true,
    phase: 'DONE',
    taskCard: compactedCard,
    technicalPlan: plan,
    verdict: consensusVerdict,
  };
}
