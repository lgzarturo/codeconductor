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
  rollbackTaskStatus,
  formatGoalStatus,
} from './core/orchestrator/runtime-orchestrator';
export type { OrchestratorNextResult } from './core/orchestrator/runtime-orchestrator';

export {
  LoopEngine,
  runLoop,
  runLoopForProject,
  shouldRunAgentLoop,
  formatFeedback,
  advanceTddPhase,
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
  captureTddSuiteEvidence,
  loadTddSuiteEvidence,
} from './core/verification/verification-runner';
export type {
  RunVerificationOptions,
  VerificationCheck,
  CaptureTddSuiteOptions,
} from './core/verification/verification-runner';

export * from './validation/schemas';

export {
  createInitialState,
  loopStateMachine,
  createInitialTddState,
  tddCycleStateMachine,
} from './domain/loop/loop-state';
export type {
  LoopPhase,
  LoopState,
  LoopAction,
  LoopActionResult,
  TddPhase,
  TddState,
  TddAction,
  TddSuiteEvidence,
} from './domain/loop/loop-state';
