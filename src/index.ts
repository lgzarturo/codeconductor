/**
 * Public library surface for CodeConductor.
 *
 * CLI remains `dist/index.js` (`bin`). This module is the programmatic API.
 * Do not re-export `infrastructure/` or `*-internal` modules.
 */

export {
  getReadyTasks,
  goalTaskToCanonicalCard,
  buildTaskEnvelope,
  getNextTask,
  startTask,
  completeTask,
  formatGoalStatus,
} from './core/orchestrator/runtime-orchestrator';
export type { OrchestratorNextResult } from './core/orchestrator/runtime-orchestrator';

export {
  LoopEngine,
  runLoop,
  runLoopForProject,
  shouldRunAgentLoop,
  formatFeedback,
} from './core/loop/loop-engine';
export type {
  LoopConfig,
  LoopResult,
  EscalationReport,
  GuardrailHit,
  GenerateFn,
  CompileCheckFn,
} from './core/loop/loop-engine';

export {
  runVerification,
  gateTaskCompletion,
  validateEvidenceIds,
} from './core/verification/verification-runner';
export type {
  RunVerificationOptions,
  VerificationCheck,
} from './core/verification/verification-runner';

export * from './validation/schemas';

export { createInitialState, loopStateMachine } from './domain/loop/loop-state';
export type {
  LoopPhase,
  LoopState,
  LoopAction,
  LoopActionResult,
} from './domain/loop/loop-state';
