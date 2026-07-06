/**
 * Loop Controller — execution harness for the compile-fix iteration cycle.
 *
 * Orchestrates: generate → compile check → feedback → repeat.
 */

import type { CompileError, CompileResult } from '../compilation/compile-checker';
import type { LoopState } from '../../domain/loop/loop-state';
import {
  createInitialState,
  loopStateMachine,
} from '../../domain/loop/loop-state';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LoopConfig {
  /** Max iterations before escalation. Default: 3 */
  maxIterations?: number;
  /** Max token budget (0 = unlimited). Default: 0 */
  maxTokenBudget?: number;
  /** Build command override (passed to compile checker). */
  buildCommand?: string;
  /** Working directory. Default: process.cwd() */
  cwd?: string;
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
}

// ─── Feedback Formatting ─────────────────────────────────────────────────────

/**
 * Format CompileError[] into a structured prompt string for agent re-injection.
 */
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

// ─── Logging Helper ──────────────────────────────────────────────────────────

function logTransition(phase: string, action: string, iteration: number): void {
  process.stderr.write(
    `[loop] ${new Date().toISOString()} phase=${phase} action=${action} iteration=${iteration}\n`,
  );
}

// ─── Loop Runner ─────────────────────────────────────────────────────────────

export type GenerateFn = (feedback?: string) => Promise<void>;
export type CompileCheckFn = () => Promise<CompileResult>;

/**
 * Run the compile-fix iteration loop.
 *
 * @param generateFn - Called to generate code. Receives feedback string on retry.
 * @param compileCheckFn - Called after generation to check compilation.
 * @param config - Loop configuration.
 * @param taskTitle - Optional title for the escalation report.
 */
export async function runLoop(
  generateFn: GenerateFn,
  compileCheckFn: CompileCheckFn,
  config: LoopConfig = {},
  taskTitle = 'compile-fix-loop',
  originalTask?: string,
): Promise<LoopResult> {
  const maxIterations = config.maxIterations ?? 3;
  // TODO: token budget tracking — maxTokenBudget is configured but not enforced.
  // When implemented, check tokenBudgetUsed against maxTokenBudget in the main
  // loop and early-terminate with ESCALATED if exceeded.
  const maxTokenBudget = config.maxTokenBudget ?? 0;

  let state = createInitialState({ maxIterations, maxTokenBudget });
  let totalErrors = 0;
  let feedbackText: string | undefined;

  logTransition(state.phase, 'INIT', state.iteration);

  // START
  const startResult = loopStateMachine(state, { type: 'START' });
  state = startResult.state;
  logTransition(state.phase, 'START', state.iteration);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    switch (state.phase) {
      case 'RUNNING': {
        logTransition(state.phase, 'GENERATE', state.iteration);
        await generateFn(feedbackText);
        feedbackText = undefined;

        const genResult = loopStateMachine(state, { type: 'CODE_GENERATED' });
        state = genResult.state;
        logTransition(state.phase, 'CODE_GENERATED', state.iteration);
        break;
      }

      case 'CHECKING': {
        logTransition(state.phase, 'COMPILE_CHECK', state.iteration);
        const compileResult = await compileCheckFn();
        totalErrors += compileResult.errors.length;

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
        };
      }

      case 'ESCALATED': {
        logTransition(state.phase, 'ESCALATED', state.iteration);
        const report = buildEscalationReport(
          taskTitle,
          state,
          originalTask,
        );
        return {
          success: false,
          iterations: state.iteration,
          totalErrors,
          finalPhase: 'ESCALATED',
          escalationReport: report,
          errorHistory: state.errorHistory,
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
        };
      }

      default: {
        // IDLE should not happen after START, but guard anyway
        logTransition(state.phase, 'UNEXPECTED', state.iteration);
        return {
          success: false,
          iterations: state.iteration,
          totalErrors,
          finalPhase: state.phase,
          errorHistory: state.errorHistory,
        };
      }
    }
  }

  // Should not reach here — exhaustive switch above covers all terminal states
  return {
    success: false,
    iterations: state.iteration,
    totalErrors,
    finalPhase: state.phase,
    errorHistory: state.errorHistory,
  };
}

// ─── Escalation Report Builder ───────────────────────────────────────────────

function buildEscalationReport(
  taskTitle: string,
  state: LoopState,
  originalTask?: string,
): EscalationReport {
  // Build attempted fixes from feedback history
  const attemptedFixes: string[] = [];
  for (let i = 0; i < state.errorHistory.length; i++) {
    const errs = state.errorHistory[i]!;
    if (errs.length > 0) {
      attemptedFixes.push(
        `Iteration ${i + 1}: ${errs.length} error(s) — ${errs.map((e) => `${e.code || 'unknown'}: ${e.message}`).join('; ')}`,
      );
    }
  }

  // Determine recommended action
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
    recommendedAction =
      'Max iterations reached. Review errors and consider manual fixes.';
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
