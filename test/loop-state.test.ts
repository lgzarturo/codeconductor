import { describe, expect, it } from 'bun:test';
import {
  createInitialState,
  loopStateMachine,
} from '../src/domain/loop/loop-state';
import type { CompileError } from '../src/core/compilation/compile-checker';

// ─── Test data ───────────────────────────────────────────────────────────────

const ERR_A: CompileError = {
  file: 'src/index.ts',
  line: 10,
  column: 5,
  code: 'TS2322',
  message: "Type 'string' is not assignable to type 'number'.",
  raw: 'src/index.ts(10,5): error TS2322: Type mismatch',
};

const ERR_B: CompileError = {
  file: 'src/app.ts',
  line: 3,
  code: 'TS7006',
  message: "Parameter 'x' implicitly has an 'any' type.",
  raw: 'src/app.ts(3): error TS7006: Parameter x implicitly has any type',
};

// ─── createInitialState ──────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('returns defaults', () => {
    const s = createInitialState();
    expect(s.phase).toBe('IDLE');
    expect(s.iteration).toBe(0);
    expect(s.maxIterations).toBe(3);
    expect(s.errors).toEqual([]);
    expect(s.errorHistory).toEqual([]);
  });

  it('allows overrides', () => {
    const s = createInitialState({ maxIterations: 5, phase: 'RUNNING' });
    expect(s.maxIterations).toBe(5);
    expect(s.phase).toBe('RUNNING');
  });
});

// ─── Valid transitions ───────────────────────────────────────────────────────

describe('loopStateMachine — valid transitions', () => {
  it('IDLE + START → RUNNING (iteration 1)', () => {
    const s = createInitialState();
    const r = loopStateMachine(s, { type: 'START' });
    expect(r.result).toBe('CONTINUE');
    expect(r.state.phase).toBe('RUNNING');
    expect(r.state.iteration).toBe(1);
  });

  it('RUNNING + CODE_GENERATED → CHECKING', () => {
    const s = createInitialState({ phase: 'RUNNING', iteration: 1 });
    const r = loopStateMachine(s, { type: 'CODE_GENERATED' });
    expect(r.result).toBe('CONTINUE');
    expect(r.state.phase).toBe('CHECKING');
  });

  it('CHECKING + COMPILE_CHECK_COMPLETED (no errors) → DONE', () => {
    const s = createInitialState({ phase: 'CHECKING', iteration: 1 });
    const r = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [],
    });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('DONE');
  });

  it('CHECKING + COMPILE_CHECK_COMPLETED (with errors, iter < max) → FEEDBACK', () => {
    const s = createInitialState({ phase: 'CHECKING', iteration: 1 });
    const r = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [ERR_A],
    });
    expect(r.result).toBe('CONTINUE');
    expect(r.state.phase).toBe('FEEDBACK');
    expect(r.state.errors).toHaveLength(1);
    expect(r.state.errorHistory).toHaveLength(1);
  });

  it('FEEDBACK + FEEDBACK_FORMATTED → RUNNING (iteration +1)', () => {
    const s = createInitialState({
      phase: 'FEEDBACK',
      iteration: 1,
      errors: [ERR_A],
      errorHistory: [[ERR_A]],
    });
    const r = loopStateMachine(s, { type: 'FEEDBACK_FORMATTED' });
    expect(r.result).toBe('CONTINUE');
    expect(r.state.phase).toBe('RUNNING');
    expect(r.state.iteration).toBe(2);
  });

  it('full cycle: IDLE → RUNNING → CHECKING → FEEDBACK → RUNNING → CHECKING → DONE', () => {
    let s = createInitialState();

    s = loopStateMachine(s, { type: 'START' }).state;
    expect(s.phase).toBe('RUNNING');

    s = loopStateMachine(s, { type: 'CODE_GENERATED' }).state;
    expect(s.phase).toBe('CHECKING');

    s = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [ERR_A],
    }).state;
    expect(s.phase).toBe('FEEDBACK');

    s = loopStateMachine(s, { type: 'FEEDBACK_FORMATTED' }).state;
    expect(s.phase).toBe('RUNNING');
    expect(s.iteration).toBe(2);

    s = loopStateMachine(s, { type: 'CODE_GENERATED' }).state;
    expect(s.phase).toBe('CHECKING');

    s = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [],
    }).state;
    expect(s.phase).toBe('DONE');
  });
});

// ─── Invalid transitions ─────────────────────────────────────────────────────

describe('loopStateMachine — invalid transitions', () => {
  it('IDLE + CODE_GENERATED → no change', () => {
    const s = createInitialState();
    const r = loopStateMachine(s, { type: 'CODE_GENERATED' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('IDLE');
  });

  it('IDLE + COMPILE_CHECK_COMPLETED → no change', () => {
    const s = createInitialState();
    const r = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [],
    });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('IDLE');
  });

  it('RUNNING + START → no change', () => {
    const s = createInitialState({ phase: 'RUNNING', iteration: 1 });
    const r = loopStateMachine(s, { type: 'START' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('RUNNING');
  });
});

// ─── Iteration limit → ESCALATED ─────────────────────────────────────────────

describe('loopStateMachine — iteration limit', () => {
  it('3 failures → ESCALATED at iteration 3', () => {
    let s = createInitialState({ maxIterations: 3 });

    // Iteration 1: START
    s = loopStateMachine(s, { type: 'START' }).state;
    // Iteration 1: CODE_GENERATED → CHECKING
    s = loopStateMachine(s, { type: 'CODE_GENERATED' }).state;
    // Iteration 1: errors → FEEDBACK
    s = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [ERR_A],
    }).state;
    expect(s.phase).toBe('FEEDBACK');
    // Iteration 2: FEEDBACK_FORMATTED → RUNNING
    s = loopStateMachine(s, { type: 'FEEDBACK_FORMATTED' }).state;
    expect(s.iteration).toBe(2);

    // Iteration 2: CODE_GENERATED → CHECKING
    s = loopStateMachine(s, { type: 'CODE_GENERATED' }).state;
    // Iteration 2: errors → FEEDBACK
    s = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [ERR_B],
    }).state;
    expect(s.phase).toBe('FEEDBACK');
    // Iteration 3: FEEDBACK_FORMATTED → RUNNING
    s = loopStateMachine(s, { type: 'FEEDBACK_FORMATTED' }).state;
    expect(s.iteration).toBe(3);

    // Iteration 3: CODE_GENERATED → CHECKING
    s = loopStateMachine(s, { type: 'CODE_GENERATED' }).state;
    // Iteration 3: errors → ESCALATED (iteration >= maxIterations)
    const r = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [ERR_A],
    });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('ESCALATED');
    expect(r.state.iteration).toBe(3);
    expect(r.state.errorHistory).toHaveLength(3);
  });
});

// ─── Stuck loop detection ────────────────────────────────────────────────────

describe('loopStateMachine — stuck loop detection', () => {
  it('identical errors in 2 consecutive iterations → ESCALATED', () => {
    let s = createInitialState({ maxIterations: 3 });

    // Iteration 1: full cycle
    s = loopStateMachine(s, { type: 'START' }).state;
    s = loopStateMachine(s, { type: 'CODE_GENERATED' }).state;
    s = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [ERR_A],
    }).state;
    s = loopStateMachine(s, { type: 'FEEDBACK_FORMATTED' }).state;

    // Iteration 2: same errors
    s = loopStateMachine(s, { type: 'CODE_GENERATED' }).state;
    const r = loopStateMachine(s, {
      type: 'COMPILE_CHECK_COMPLETED',
      errors: [ERR_A], // identical to iteration 1
    });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('ESCALATED');
  });
});

// ─── ABORT ───────────────────────────────────────────────────────────────────

describe('loopStateMachine — ABORT', () => {
  it('ABORT from IDLE → FAILED', () => {
    const s = createInitialState();
    const r = loopStateMachine(s, { type: 'ABORT' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('FAILED');
  });

  it('ABORT from RUNNING → FAILED', () => {
    const s = createInitialState({ phase: 'RUNNING', iteration: 1 });
    const r = loopStateMachine(s, { type: 'ABORT' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('FAILED');
  });

  it('ABORT from CHECKING → FAILED', () => {
    const s = createInitialState({ phase: 'CHECKING', iteration: 1 });
    const r = loopStateMachine(s, { type: 'ABORT' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('FAILED');
  });

  it('ABORT from FEEDBACK → FAILED', () => {
    const s = createInitialState({ phase: 'FEEDBACK', iteration: 1 });
    const r = loopStateMachine(s, { type: 'ABORT' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('FAILED');
  });

  it('ABORT from DONE → stays DONE', () => {
    const s = createInitialState({ phase: 'DONE' });
    const r = loopStateMachine(s, { type: 'ABORT' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('DONE');
  });

  it('ABORT from ESCALATED → stays ESCALATED', () => {
    const s = createInitialState({ phase: 'ESCALATED' });
    const r = loopStateMachine(s, { type: 'ABORT' });
    expect(r.result).toBe('TERMINATE');
    expect(r.state.phase).toBe('ESCALATED');
  });
});

// ─── Terminal states ─────────────────────────────────────────────────────────

describe('loopStateMachine — terminal states reject all actions', () => {
  it('DONE rejects all actions', () => {
    const s = createInitialState({ phase: 'DONE' });
    expect(loopStateMachine(s, { type: 'START' }).result).toBe('TERMINATE');
    expect(loopStateMachine(s, { type: 'CODE_GENERATED' }).result).toBe('TERMINATE');
    expect(
      loopStateMachine(s, {
        type: 'COMPILE_CHECK_COMPLETED',
        errors: [],
      }).result,
    ).toBe('TERMINATE');
  });

  it('ESCALATED rejects all actions', () => {
    const s = createInitialState({ phase: 'ESCALATED' });
    expect(loopStateMachine(s, { type: 'START' }).result).toBe('TERMINATE');
    expect(loopStateMachine(s, { type: 'CODE_GENERATED' }).result).toBe('TERMINATE');
  });
});
