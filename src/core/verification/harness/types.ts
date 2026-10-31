export type HarnessState =
  | 'STUB_GENERATION'
  | 'TEST_AUTHORING'
  | 'SEAL_AND_VERIFY_RED'
  | 'IMPLEMENTATION_LOOP'
  | 'BLIND_ARBITRATION'
  | 'DIFF_MUTATION_GATE'
  | 'COMPLETED'
  | 'BLOCKED_SPEC'
  | 'ABORTED';

export interface ChallengeCertificate {
  readonly testFile: string;
  readonly testName: string;
  readonly specReference: string;
  readonly sealedAssertion: string;
  readonly executionEvidence: string;
}

export interface ArbiterVerdict {
  readonly verdict: 'REJECT_CHALLENGE' | 'UPHOLD_TEST_BUG' | 'SPEC_AMBIGUITY';
  readonly reasoning: string;
  readonly authorFixInstruction: string | null;
}

/** Paths in `testFiles`, `protectedConfigs` and runner results are relative to `worktreeRoot`. */
export interface TaskContext {
  readonly taskCardPath: string;
  readonly worktreeRoot: string;
  readonly testFiles: readonly string[];
  readonly protectedConfigs: readonly string[];
  readonly domainGlobs: readonly string[];
  readonly maxImplementerRetries?: number;
  readonly minAttemptsBeforeChallenge?: number;
  readonly maxChallengesAllowed?: number;
}

export interface ImplementerStepResult {
  readonly passed: boolean;
  readonly modified: readonly string[];
  readonly challenge: ChallengeCertificate | null;
}

/** Injected by the caller; the state machine never talks to an LLM itself. */
export interface HarnessRunner {
  generateStubs(ctx: TaskContext): Promise<string[]>;
  authorTests(ctx: TaskContext, fixInstruction: string | null): Promise<void>;
  verifyRedPhase(ctx: TaskContext): Promise<boolean>;
  runImplementerStep(ctx: TaskContext): Promise<ImplementerStepResult>;
  invokeBlindArbiter(cert: ChallengeCertificate, taskCardPath: string): Promise<ArbiterVerdict>;
  runDiffMutation(ctx: TaskContext): Promise<boolean>;
}

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
}

export interface Collision {
  readonly name: string;
  readonly stubFile: string;
  readonly existingFile: string;
}

export class SealViolationError extends Error {}

export class GatekeeperError extends Error {
  constructor(readonly violations: readonly Violation[]) {
    super(violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`).join('\n'));
  }
}

export class SymbolCollisionError extends Error {
  constructor(readonly collisions: readonly Collision[]) {
    super(
      collisions
        .map((c) => `'${c.name}' in ${c.stubFile} already exists in ${c.existingFile}`)
        .join('\n'),
    );
  }
}
