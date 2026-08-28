import {
  isAllowlistedCompileCommand,
  runCompileCheck,
  type CompileError,
  type CompileResult,
} from '../compilation/compile-checker';
import { loadConfig } from '../config/config-loader';
import {
  createInitialState,
  loopStateMachine,
  tddCycleStateMachine,
  type LoopState,
  type TddState,
} from '../../domain/loop/loop-state';
import { readGitChangeStats, type GitStatsReader } from './git-stats';
import {
  loadTddSuiteEvidence,
} from '../verification/verification-runner';
import { err, ok, type Result } from '../../utils/result';

export interface LoopConfig {
  maxIterations?: number;
  maxTokenBudget?: number;
  buildCommand?: string;
  cwd?: string;
  maxWallClockSeconds?: number;
  maxFilesModified?: number;
  maxLinesChanged?: number;
  gitStats?: GitStatsReader;
}

export interface EscalationReport {
  readonly taskTitle: string;
  readonly iterationsAttempted: number;
  readonly errorHistory: readonly (readonly CompileError[])[];
  readonly attemptedFixes: readonly string[];
  readonly originalContext: string;
  readonly recommendedAction: string;
}

export interface LoopResult {
  readonly success: boolean;
  readonly iterations: number;
  readonly totalErrors: number;
  readonly finalPhase: LoopState['phase'];
  readonly escalationReport?: EscalationReport;
  readonly errorHistory: readonly (readonly CompileError[])[];
  readonly compileCheck?: 'ran' | 'skipped';
  readonly compileCheckSkipReason?: string;
}

export type GuardrailHit =
  | { readonly kind: 'timeout'; readonly elapsedSeconds: number; readonly limit: number }
  | { readonly kind: 'files'; readonly count: number; readonly limit: number }
  | { readonly kind: 'lines'; readonly count: number; readonly limit: number };

/**
 * Shared wall-clock / git-diff budget checks for compile-fix and the 8-phase pipeline.
 */
export class LoopEngine {
  readonly startedAt: number;

  constructor(
    private readonly limits: {
      readonly maxWallClockSeconds?: number;
      readonly maxFilesModified?: number;
      readonly maxLinesChanged?: number;
      readonly cwd?: string;
    },
    gitStats?: GitStatsReader,
    startedAt = Date.now(),
  ) {
    this.gitStats = gitStats ?? ((cwd) => readGitChangeStats(cwd));
    this.startedAt = startedAt;
  }

  private readonly gitStats: GitStatsReader;

  async evaluate(scope: 'time' | 'all' = 'all'): Promise<GuardrailHit | null> {
    const maxWall = this.limits.maxWallClockSeconds ?? 0;
    if (maxWall > 0) {
      const elapsedSeconds = (Date.now() - this.startedAt) / 1000;
      if (elapsedSeconds > maxWall) {
        return { kind: 'timeout', elapsedSeconds, limit: maxWall };
      }
    }

    if (scope === 'time') return null;

    const maxFiles = this.limits.maxFilesModified ?? 0;
    const maxLines = this.limits.maxLinesChanged ?? 0;
    if (maxFiles <= 0 && maxLines <= 0) return null;

    const stats = await this.gitStats(this.limits.cwd ?? process.cwd());
    if (maxFiles > 0 && stats.filesModified > maxFiles) {
      return { kind: 'files', count: stats.filesModified, limit: maxFiles };
    }
    if (maxLines > 0 && stats.linesChanged > maxLines) {
      return { kind: 'lines', count: stats.linesChanged, limit: maxLines };
    }
    return null;
  }
}

export function formatFeedback(errors: readonly CompileError[]): string {
  if (errors.length === 0) return '';

  const lines: string[] = [
    `The previous code generation produced ${errors.length} compilation error(s).`,
    'Please fix the following issues:',
    '',
  ];

  for (let i = 0; i < errors.length; i++) {
    const err = errors[i]!;
    const location = [err.file, err.line, err.column].filter(Boolean).join(':');
    const codePart = err.code ? ` [${err.code}]` : '';
    lines.push(`${i + 1}. ${location}${codePart}: ${err.message}`);
    lines.push(`   Raw: ${err.raw}`);
    lines.push('');
  }

  lines.push('Generate corrected code that resolves all errors above.');
  return lines.join('\n');
}

function logTransition(phase: string, action: string, iteration: number): void {
  process.stderr.write(
    `[loop] ${new Date().toISOString()} phase=${phase} action=${action} iteration=${iteration}\n`,
  );
}

export type GenerateFn = (feedback?: string) => Promise<{ tokenUsage: number } | void>;
export type CompileCheckFn = () => Promise<CompileResult>;

export async function runLoop(
  generateFn: GenerateFn,
  compileCheckFn: CompileCheckFn,
  config: LoopConfig = {},
  taskTitle = 'compile-fix-loop',
  originalTask?: string,
): Promise<LoopResult> {
  const maxIterations = config.maxIterations ?? 3;
  const maxTokenBudget = config.maxTokenBudget ?? 0;
  const engine = new LoopEngine(
    {
      maxWallClockSeconds: config.maxWallClockSeconds ?? 0,
      maxFilesModified: config.maxFilesModified ?? 0,
      maxLinesChanged: config.maxLinesChanged ?? 0,
      cwd: config.cwd,
    },
    config.gitStats,
  );

  let state = createInitialState({ maxIterations, maxTokenBudget });
  let totalErrors = 0;
  let feedbackText: string | undefined;
  let compileCheck: LoopResult['compileCheck'];
  let compileCheckSkipReason: string | undefined;

  logTransition(state.phase, 'INIT', state.iteration);

  const startResult = loopStateMachine(state, { type: 'START' });
  state = startResult.state;
  logTransition(state.phase, 'START', state.iteration);

  while (true) {
    const hit = await engine.evaluate();
    if (hit) {
      return guardrailResult(hit, state, totalErrors, taskTitle, originalTask);
    }

    switch (state.phase) {
      case 'RUNNING': {
        logTransition(state.phase, 'GENERATE', state.iteration);
        const genResult2 = await generateFn(feedbackText);
        feedbackText = undefined;

        const tokenUsage =
          genResult2 && typeof genResult2 === 'object' && 'tokenUsage' in genResult2
            ? (genResult2 as { tokenUsage: number }).tokenUsage
            : 0;
        const newBudgetUsed = state.tokenBudgetUsed + tokenUsage;
        if (state.maxTokenBudget > 0 && newBudgetUsed > state.maxTokenBudget) {
          const budgetResult = loopStateMachine(state, {
            type: 'TOKEN_BUDGET_EXCEEDED',
            tokenUsage: newBudgetUsed,
          });
          state = budgetResult.state;
          logTransition(state.phase, 'TOKEN_BUDGET_EXCEEDED', state.iteration);
          break;
        }

        const updatedState = { ...state, tokenBudgetUsed: newBudgetUsed };
        const genResult = loopStateMachine(updatedState, { type: 'CODE_GENERATED' });
        state = genResult.state;
        logTransition(state.phase, 'CODE_GENERATED', state.iteration);
        break;
      }

      case 'CHECKING': {
        logTransition(state.phase, 'COMPILE_CHECK', state.iteration);
        const compileResult = await compileCheckFn();
        totalErrors += compileResult.errors.length;
        if (compileResult.skipped) {
          compileCheck = 'skipped';
          compileCheckSkipReason = compileResult.skipReason;
        } else {
          compileCheck = 'ran';
        }

        const checkResult = loopStateMachine(state, {
          type: 'COMPILE_CHECK_COMPLETED',
          errors: compileResult.errors,
        });
        state = checkResult.state;
        logTransition(state.phase, 'COMPILE_CHECK_COMPLETED', state.iteration);
        break;
      }

      case 'FEEDBACK': {
        logTransition(state.phase, 'FORMAT_FEEDBACK', state.iteration);
        feedbackText = formatFeedback(state.errors);

        const fbResult = loopStateMachine(state, { type: 'FEEDBACK_FORMATTED' });
        state = fbResult.state;
        logTransition(state.phase, 'FEEDBACK_FORMATTED', state.iteration);
        break;
      }

      case 'DONE': {
        logTransition(state.phase, 'DONE', state.iteration);
        return {
          success: true,
          iterations: state.iteration,
          totalErrors,
          finalPhase: 'DONE',
          errorHistory: state.errorHistory,
          compileCheck,
          compileCheckSkipReason,
        };
      }

      case 'ESCALATED': {
        logTransition(state.phase, 'ESCALATED', state.iteration);
        const report = buildEscalationReport(taskTitle, state, originalTask);
        return {
          success: false,
          iterations: state.iteration,
          totalErrors,
          finalPhase: 'ESCALATED',
          escalationReport: report,
          errorHistory: state.errorHistory,
          compileCheck,
          compileCheckSkipReason,
        };
      }

      case 'FAILED': {
        logTransition(state.phase, 'FAILED', state.iteration);
        return {
          success: false,
          iterations: state.iteration,
          totalErrors,
          finalPhase: 'FAILED',
          errorHistory: state.errorHistory,
          compileCheck,
          compileCheckSkipReason,
        };
      }

      default: {
        logTransition(state.phase, 'UNEXPECTED', state.iteration);
        return {
          success: false,
          iterations: state.iteration,
          totalErrors,
          finalPhase: state.phase,
          errorHistory: state.errorHistory,
          compileCheck,
          compileCheckSkipReason,
        };
      }
    }
  }
}

function guardrailResult(
  hit: GuardrailHit,
  state: LoopState,
  totalErrors: number,
  taskTitle: string,
  originalTask?: string,
): LoopResult {
  const attempted =
    hit.kind === 'timeout'
      ? `Time limit exceeded: ${hit.elapsedSeconds.toFixed(1)}s elapsed (max: ${hit.limit}s)`
      : hit.kind === 'files'
        ? `Files modified limit exceeded: ${hit.count} files modified (max: ${hit.limit})`
        : `Lines changed limit exceeded: ${hit.count} lines changed (max: ${hit.limit})`;
  const recommended =
    hit.kind === 'timeout'
      ? `Operational guardrail triggered: maxWallClockSeconds limit (${hit.limit}s) exceeded. Increase limit or optimize execution time.`
      : hit.kind === 'files'
        ? `Operational guardrail triggered: maxFilesModified limit (${hit.limit}) exceeded. Check for scope creep.`
        : `Operational guardrail triggered: maxLinesChanged limit (${hit.limit}) exceeded. Check for large diffs or unnecessary refactoring.`;
  const action =
    hit.kind === 'timeout'
      ? 'TIMEOUT_GUARDRAIL'
      : hit.kind === 'files'
        ? 'FILES_MODIFIED_GUARDRAIL'
        : 'LINES_CHANGED_GUARDRAIL';
  logTransition(state.phase, action, state.iteration);
  return {
    success: false,
    iterations: state.iteration,
    totalErrors,
    finalPhase: 'ESCALATED',
    errorHistory: state.errorHistory,
    escalationReport: {
      taskTitle,
      iterationsAttempted: state.iteration,
      errorHistory: state.errorHistory,
      attemptedFixes: [attempted],
      originalContext: originalTask ?? 'No original task provided',
      recommendedAction: recommended,
    },
  };
}

function buildEscalationReport(
  taskTitle: string,
  state: LoopState,
  originalTask?: string,
): EscalationReport {
  const attemptedFixes: string[] = [];
  for (let i = 0; i < state.errorHistory.length; i++) {
    const errs = state.errorHistory[i]!;
    if (errs.length > 0) {
      attemptedFixes.push(
        `Iteration ${i + 1}: ${errs.length} error(s) — ${errs.map((e) => `${e.code || 'unknown'}: ${e.message}`).join('; ')}`,
      );
    }
  }

  let recommendedAction: string;
  if (state.errorHistory.length >= 2) {
    const last = state.errorHistory[state.errorHistory.length - 1]!;
    const prev = state.errorHistory[state.errorHistory.length - 2]!;
    const identical =
      last.length === prev.length &&
      last.every(
        (e, i) =>
          e.file === prev[i]!.file &&
          e.code === prev[i]!.code &&
          e.message === prev[i]!.message,
      );
    if (identical) {
      recommendedAction =
        'Errors are identical across consecutive iterations. The agent appears unable to resolve these errors automatically. Manual intervention required.';
    } else {
      recommendedAction =
        'Max iterations reached with remaining errors. Review the error pattern and consider alternative approaches.';
    }
  } else {
    recommendedAction = 'Max iterations reached. Review errors and consider manual fixes.';
  }

  return {
    taskTitle,
    iterationsAttempted: state.iteration,
    errorHistory: state.errorHistory,
    attemptedFixes,
    originalContext: originalTask ?? 'No original task provided',
    recommendedAction,
  };
}

const CLEAN_COMPILE: CompileResult = {
  success: true,
  exitCode: 0,
  stdout: '',
  stderr: '',
  errors: [],
  durationMs: 0,
  timedOut: false,
};

export function skippedCompileResult(reason: string): CompileResult {
  return {
    ...CLEAN_COMPILE,
    skipped: true,
    skipReason: reason,
    stderr: `compileCheck: skipped\n${reason}`,
  };
}

/** implement / test agent phases that must run the compile-fix engine. */
export function shouldRunAgentLoop(
  type?: string,
  agentType?: string,
  phase?: string,
): boolean {
  if (phase === 'implement' || phase === 'test') return true;
  if (agentType === 'implementer' || agentType === 'tester') return true;
  return type === 'feature' || type === 'fix' || type === 'test';
}

/**
 * Apply runner-captured TDD suite evidence to the domain TDD machine.
 * Hand-written evidence files fail closed via `loadTddSuiteEvidence`.
 */
export async function advanceTddPhase(
  projectRoot: string,
  taskId: string,
  state: TddState,
  evidenceId: string,
): Promise<Result<{ state: TddState; result: 'CONTINUE' | 'TERMINATE' }, Error>> {
  const loaded = await loadTddSuiteEvidence(projectRoot, taskId, evidenceId);
  if (!loaded.success) return loaded;
  const next = tddCycleStateMachine(state, {
    type: 'SUITE_EVIDENCE',
    evidenceId,
    evidence: loaded.data,
  });
  return ok(next);
}

export async function runLoopForProject(
  projectRoot: string,
  options: {
    readonly taskTitle: string;
    readonly allowCompileCheck?: boolean;
    readonly originalTask?: string;
  },
): Promise<LoopResult> {
  const configResult = await loadConfig(projectRoot);
  const loopCfg = configResult.success ? configResult.data.loop : undefined;
  const compileCheck = configResult.success
    ? configResult.data.safety.compileCheck
    : undefined;

  const compileCheckFn: CompileCheckFn = async () => {
    if (!compileCheck?.enabled || !compileCheck.command) {
      return skippedCompileResult(
        !compileCheck?.enabled
          ? 'Compile check is not enabled in config.'
          : 'Compile check is enabled but no command is configured.',
      );
    }
    const allowed =
      options.allowCompileCheck === true ||
      isAllowlistedCompileCommand(compileCheck.command);
    if (!allowed) {
      return skippedCompileResult(
        'Compile check not executed: the command is not on the compile allowlist. ' +
          'Re-run with --allow-compile-check to trust it.',
      );
    }
    const result = await runCompileCheck({
      command: compileCheck.command,
      cwd: projectRoot,
      timeoutMs: compileCheck.timeoutMs,
    });
    if (result.success && result.errors.length === 0) return result;
    return {
      ...result,
      errors:
        result.errors.length > 0
          ? result.errors
          : [
              {
                file: compileCheck.command,
                code: 'COMPILE',
                message: `Compile check failed (exit ${result.exitCode})`,
                raw: result.stderr || result.stdout,
              },
            ],
    };
  };

  return runLoop(
    async () => ({ tokenUsage: 0 }),
    compileCheckFn,
    {
      cwd: projectRoot,
      maxIterations: loopCfg?.maxIterations ?? 3,
      maxTokenBudget: loopCfg?.maxTokenBudget ?? 0,
    },
    options.taskTitle,
    options.originalTask,
  );
}
