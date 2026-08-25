/**
 * Compile-fix loop — re-exports the unified LoopEngine runner.
 * Prefer importing from `./loop-engine` for new call sites.
 */
export {
  formatFeedback,
  runLoop,
  type CompileCheckFn,
  type EscalationReport,
  type GenerateFn,
  type LoopConfig,
  type LoopResult,
} from './loop-engine';
