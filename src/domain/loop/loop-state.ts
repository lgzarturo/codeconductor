/**
 * Loop State Machine — pure state transitions for compile-fix iteration cycles.
 *
 * Phases: IDLE → RUNNING → CHECKING → FEEDBACK → (back to RUNNING or DONE/FAILED/ESCALATED)
 */

import type { CompileError } from '../../core/compilation/compile-checker';

// ─── Types ───────────────────────────────────────────────────────────────────

export type LoopPhase =
  | 'IDLE'
  | 'RUNNING'
  | 'CHECKING'
  | 'FEEDBACK'
  | 'DONE'
  | 'FAILED'
  | 'ESCALATED';

export interface LoopState {
  readonly phase: LoopPhase;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly errors: readonly CompileError[];
  readonly errorHistory: readonly (readonly CompileError[])[];
  readonly tokenBudgetUsed: number;
  readonly maxTokenBudget: number;
}

export type LoopAction =
  | { readonly type: 'START' }
  | { readonly type: 'CODE_GENERATED' }
  | { readonly type: 'COMPILE_CHECK_COMPLETED'; readonly errors: readonly CompileError[] }
  | { readonly type: 'FEEDBACK_FORMATTED' }
  | { readonly type: 'TOKEN_BUDGET_EXCEEDED'; readonly tokenUsage: number }
  | { readonly type: 'ABORT' };

export type LoopActionResult = 'CONTINUE' | 'TERMINATE';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create an initial LoopState with sensible defaults.
 */
export function createInitialState(overrides?: Partial<LoopState>): LoopState {
  return {
    phase: 'IDLE',
    iteration: 0,
    maxIterations: 3,
    errors: [],
    errorHistory: [],
    tokenBudgetUsed: 0,
    maxTokenBudget: 0,
    ...overrides,
  };
}

/**
 * Check if two error arrays are identical (same count, same file+code+message).
 */
function errorsEqual(
  a: readonly CompileError[],
  b: readonly CompileError[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (ea, i) =>
      ea.file === b[i]!.file &&
      ea.code === b[i]!.code &&
      ea.message === b[i]!.message &&
      ea.line === b[i]!.line &&
      ea.column === b[i]!.column,
  );
}

/**
 * Detect stuck loop: errors identical across the last 2 consecutive iterations.
 */
function isStuckLoop(errorHistory: readonly (readonly CompileError[])[]): boolean {
  if (errorHistory.length < 2) return false;
  const last = errorHistory[errorHistory.length - 1]!;
  const prev = errorHistory[errorHistory.length - 2]!;
  return errorsEqual(last, prev);
}

// ─── State Machine ───────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<LoopPhase, LoopAction['type'][]> = {
  IDLE: ['START', 'ABORT'],
  RUNNING: ['CODE_GENERATED', 'TOKEN_BUDGET_EXCEEDED', 'ABORT'],
  CHECKING: ['COMPILE_CHECK_COMPLETED', 'ABORT'],
  FEEDBACK: ['FEEDBACK_FORMATTED', 'ABORT'],
  DONE: [],
  FAILED: [],
  ESCALATED: [],
};

/**
 * Pure state machine — given a state and an action, returns the new state.
 * No side effects. Logs are the caller's responsibility.
 */
export function loopStateMachine(
  state: LoopState,
  action: LoopAction,
): { state: LoopState; result: LoopActionResult } {
  // ABORT from any non-terminal phase → FAILED
  if (action.type === 'ABORT') {
    if (state.phase === 'DONE' || state.phase === 'FAILED' || state.phase === 'ESCALATED') {
      return { state, result: 'TERMINATE' };
    }
    return {
      state: { ...state, phase: 'FAILED' },
      result: 'TERMINATE',
    };
  }

  // Terminal states accept no actions
  if (state.phase === 'DONE' || state.phase === 'FAILED' || state.phase === 'ESCALATED') {
    return { state, result: 'TERMINATE' };
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[state.phase];
  if (!allowed || !allowed.includes(action.type)) {
    return { state, result: 'TERMINATE' };
  }

  switch (state.phase) {
    case 'IDLE': {
      if (action.type === 'START') {
        return {
          state: { ...state, phase: 'RUNNING', iteration: 1 },
          result: 'CONTINUE',
        };
      }
      break;
    }

    case 'RUNNING': {
      if (action.type === 'CODE_GENERATED') {
        return {
          state: { ...state, phase: 'CHECKING' },
          result: 'CONTINUE',
        };
      }
      if (action.type === 'TOKEN_BUDGET_EXCEEDED') {
        return {
          state: {
            ...state,
            phase: 'ESCALATED',
            tokenBudgetUsed: action.tokenUsage,
          },
          result: 'TERMINATE',
        };
      }
      break;
    }

    case 'CHECKING': {
      if (action.type === 'COMPILE_CHECK_COMPLETED') {
        const errors = action.errors;

        // No errors → DONE
        if (errors.length === 0) {
          return {
            state: {
              ...state,
              phase: 'DONE',
              errors: [],
              errorHistory: [...state.errorHistory, []],
            },
            result: 'TERMINATE',
          };
        }

        // Errors exist → FEEDBACK (if iterations remain) or ESCALATE
        const newHistory = [...state.errorHistory, errors];

        // Stuck loop detection: identical errors in 2 consecutive iterations → ESCALATE
        if (isStuckLoop(newHistory)) {
          return {
            state: {
              ...state,
              phase: 'ESCALATED',
              errors,
              errorHistory: newHistory,
            },
            result: 'TERMINATE',
          };
        }

        // Iteration limit exceeded → ESCALATE
        if (state.iteration >= state.maxIterations) {
          return {
            state: {
              ...state,
              phase: 'ESCALATED',
              errors,
              errorHistory: newHistory,
            },
            result: 'TERMINATE',
          };
        }

        // Still have iterations left → FEEDBACK
        return {
          state: {
            ...state,
            phase: 'FEEDBACK',
            errors,
            errorHistory: newHistory,
          },
          result: 'CONTINUE',
        };
      }
      break;
    }

    case 'FEEDBACK': {
      if (action.type === 'FEEDBACK_FORMATTED') {
        return {
          state: {
            ...state,
            phase: 'RUNNING',
            iteration: state.iteration + 1,
          },
          result: 'CONTINUE',
        };
      }
      break;
    }
  }

  // Fallback — should not be reached with valid transition checks
  return { state, result: 'TERMINATE' };
}

// ─── TDD cycle (RED → GREEN → REFACTOR) ──────────────────────────────────────

/**
 * Evidence payload that may advance TDD phases. Only records written by
 * `captureTddSuiteEvidence` set `capturedBy: 'verification-runner'`.
 */
export interface TddSuiteEvidence {
  readonly capturedBy: string;
  readonly suiteFailed: boolean;
  readonly suitePassed: boolean;
}

export type TddPhase = 'RED' | 'GREEN' | 'REFACTOR' | 'FAILED';

export interface TddState {
  readonly phase: TddPhase;
  readonly evidenceIds: readonly string[];
}

export type TddAction =
  | { readonly type: 'SUITE_EVIDENCE'; readonly evidenceId: string; readonly evidence: TddSuiteEvidence }
  | { readonly type: 'ABORT' };

export function createInitialTddState(): TddState {
  return { phase: 'RED', evidenceIds: [] };
}

function isRunnerTddEvidence(evidence: TddSuiteEvidence): boolean {
  return evidence.capturedBy === 'verification-runner';
}

/**
 * Guarded TDD phase machine. RED→GREEN needs a failing suite captured by the
 * verification runner; GREEN→REFACTOR needs a passing suite from the same source.
 */
export function tddCycleStateMachine(
  state: TddState,
  action: TddAction,
): { state: TddState; result: LoopActionResult } {
  if (action.type === 'ABORT') {
    if (state.phase === 'FAILED') {
      return { state, result: 'TERMINATE' };
    }
    return { state: { ...state, phase: 'FAILED' }, result: 'TERMINATE' };
  }

  if (state.phase === 'FAILED' || state.phase === 'REFACTOR') {
    return { state, result: 'TERMINATE' };
  }

  if (!isRunnerTddEvidence(action.evidence)) {
    return { state, result: 'TERMINATE' };
  }

  if (state.phase === 'RED') {
    if (action.evidence.suiteFailed && !action.evidence.suitePassed) {
      return {
        state: {
          phase: 'GREEN',
          evidenceIds: [...state.evidenceIds, action.evidenceId],
        },
        result: 'CONTINUE',
      };
    }
    return { state, result: 'TERMINATE' };
  }

  if (state.phase === 'GREEN') {
    if (action.evidence.suitePassed && !action.evidence.suiteFailed) {
      return {
        state: {
          phase: 'REFACTOR',
          evidenceIds: [...state.evidenceIds, action.evidenceId],
        },
        result: 'CONTINUE',
      };
    }
    return { state, result: 'TERMINATE' };
  }

  return { state, result: 'TERMINATE' };
}
