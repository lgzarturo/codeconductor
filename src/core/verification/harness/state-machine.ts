import { lstat, mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { isInside, resolveOutputWithinRoot, resolveWithinRoot } from '../../filesystem/path-containment';
import { FREEZE_LOCK_FILE, freezeTestSuite, verifyTestFreeze } from '../test-freeze';
import { checkProductionFiles, checkTestFiles, countAssertions } from './gatekeeper';
import { runGit } from './git';
import { findCollisions } from './symbol-map';
import {
  GatekeeperError,
  SealViolationError,
  SymbolCollisionError,
  type ChallengeCertificate,
  type HarnessRunner,
  type HarnessState,
  type TaskContext,
} from './types';

const DEFAULTS = { maxImplementerRetries: 6, minAttemptsBeforeChallenge: 3, maxChallengesAllowed: 2 };
const TERMINAL: readonly HarnessState[] = ['COMPLETED', 'BLOCKED_SPEC', 'ABORTED'];
/** Sealed with the caller's files whenever present, so a test run cannot be neutralised via config. */
const DEFAULT_PROTECTED = ['package.json', 'tsconfig.json', 'bunfig.toml'];
const LOCK_DIR = '.harness';
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DECLARATION_FILE = /\.d\.(?:ts|mts|cts)$/;

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, () => false);
}

/** A regular file; symlinks (dangling or not) are not followed. */
async function isRegularFile(path: string): Promise<boolean> {
  return lstat(path).then((s) => s.isFile(), () => false);
}

/** `git status --porcelain=v1 -z`: `XY path\0`, and renames/copies add `orig\0`. Deleted paths are skipped. */
function parseStatus(raw: string): string[] {
  const out: string[] = [];
  const entries = raw.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? '';
    if (entry.length < 4) continue;
    const [x, y] = [entry[0], entry[1]];
    if (x === 'R' || x === 'C') i++;
    if (x !== 'D' && y !== 'D') out.push(entry.slice(3));
  }
  return out;
}

/**
 * Deterministic SDD/TDD loop. Every structural rule is enforced here, not in prompts.
 *
 * `execute()` rejects with `SealViolationError`, `GatekeeperError` or
 * `SymbolCollisionError` instead of returning a state: callers must catch them.
 * It is meant for a dedicated task worktree (the changed-file set comes from git).
 */
export class HarnessStateMachine {
  private state: HarnessState = 'STUB_GENERATION';
  private attempts = 0;
  private challengesUsed = 0;
  private redVerified = false;
  private pendingChallenge: ChallengeCertificate | null = null;
  private pendingFix: string | null = null;
  private readonly assertionBaseline = new Map<string, number>();
  private sealHash = '';
  private lockDir = '';
  private sealedPaths: string[] = [];

  constructor(
    private readonly ctx: TaskContext,
    private readonly runner: HarnessRunner,
  ) {}

  async execute(): Promise<HarnessState> {
    while (!TERMINAL.includes(this.state)) {
      this.state = await this.step();
    }
    return this.state;
  }

  private step(): Promise<HarnessState> {
    switch (this.state) {
      case 'STUB_GENERATION':
        return this.handleStubs();
      case 'TEST_AUTHORING':
        return this.handleAuthoring();
      case 'SEAL_AND_VERIFY_RED':
        return this.handleSeal();
      case 'IMPLEMENTATION_LOOP':
        return this.handleImplementation();
      case 'BLIND_ARBITRATION':
        return this.handleArbitration();
      case 'DIFF_MUTATION_GATE':
        return this.handleMutation();
      default:
        throw new Error(`No handler for terminal state ${this.state}`);
    }
  }

  private abs(paths: readonly string[]): string[] {
    return paths.map((p) => {
      const full = resolve(this.ctx.worktreeRoot, p);
      if (!isInside(resolve(this.ctx.worktreeRoot), full)) throw new Error(`Path escapes worktree: ${p}`);
      return full;
    });
  }

  /** Files changed in the worktree according to git, merged with what the runner reported. */
  private async changedProduction(reported: readonly string[]): Promise<string[]> {
    const root = this.ctx.worktreeRoot;
    const status = await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    if (status === null && (await pathExists(join(root, '.git')))) {
      throw new Error('git status failed in the worktree; refusing to trust the runner-reported file list');
    }
    const fromGit = parseStatus(status ?? '');
    const sealed = new Set(this.sealedPaths);
    const isSealed = (p: string): boolean => [...sealed].some((s) => p === s || p.startsWith(`${s}/`));
    // One spelling per file: `./src/a.ts` from the runner and `src/a.ts` from git are the same file.
    const candidates = [...new Set([...reported, ...fromGit].map((p) => relative(root, resolve(root, p))))];
    const wanted = candidates.filter(
      (p) =>
        SOURCE_FILE.test(p) &&
        !DECLARATION_FILE.test(p) &&
        !isSealed(p) &&
        !p.startsWith(`${LOCK_DIR}/`) &&
        !p.includes('node_modules/'),
    );
    const present: string[] = [];
    for (const p of wanted) {
      if (p.startsWith('..') || (await isRegularFile(join(root, p)))) present.push(p);
    }
    return present;
  }

  private async assertProduction(files: readonly string[]): Promise<void> {
    const violations = await checkProductionFiles(this.abs(files));
    if (violations.length > 0) throw new GatekeeperError(violations);
  }

  private async verifySeal(): Promise<void> {
    const result = await verifyTestFreeze(
      join(this.lockDir, FREEZE_LOCK_FILE),
      this.sealedPaths,
      this.ctx.worktreeRoot,
    );
    // The lock file lives in the implementer's tree, so the hash held in memory is the anchor.
    if (!result.valid || result.actualHash !== this.sealHash) {
      throw new SealViolationError(`Sealed files changed: ${result.tamperedFiles.join(', ') || 'lock rewritten'}`);
    }
  }

  private async handleStubs(): Promise<HarnessState> {
    const stubs = await this.runner.generateStubs(this.ctx);
    await this.assertProduction(stubs);
    const collisions = await findCollisions(
      join(this.ctx.worktreeRoot, 'SYMBOL_MAP.json'),
      this.abs(stubs),
      this.ctx.worktreeRoot,
    );
    if (collisions.length > 0) throw new SymbolCollisionError(collisions);
    return 'TEST_AUTHORING';
  }

  private async handleAuthoring(): Promise<HarnessState> {
    const fix = this.pendingFix;
    this.pendingFix = null;
    await this.runner.authorTests(this.ctx, fix);

    const files = this.abs(this.ctx.testFiles);
    const violations = await checkTestFiles(files, this.ctx.domainGlobs, this.ctx.worktreeRoot);
    if (violations.length > 0) throw new GatekeeperError(violations);

    for (const file of files) {
      const count = await countAssertions(file);
      const previous = this.assertionBaseline.get(file) ?? 0;
      if (count === 0 || count < previous) {
        throw new SealViolationError(`Assertions dropped in ${file}: ${previous} -> ${count}`);
      }
      this.assertionBaseline.set(file, count);
    }
    return 'SEAL_AND_VERIFY_RED';
  }

  private async handleSeal(): Promise<HarnessState> {
    // A re-sealed fix cannot be RED again: the implementation already exists.
    if (!this.redVerified) {
      if (!(await this.runner.verifyRedPhase(this.ctx))) return 'ABORTED';
      this.redVerified = true;
    }
    await this.resolveSealedPaths();
    const lockDir = await resolveOutputWithinRoot(this.ctx.worktreeRoot, LOCK_DIR);
    if (!lockDir) throw new SealViolationError(`Lock dir ${LOCK_DIR} is not an allowed destination`);
    this.lockDir = lockDir;
    await mkdir(lockDir, { recursive: true });
    this.sealHash = (await freezeTestSuite(this.sealedPaths, lockDir, this.ctx.worktreeRoot)).hash;
    this.attempts = 0;
    return 'IMPLEMENTATION_LOOP';
  }

  private async resolveSealedPaths(): Promise<void> {
    const root = this.ctx.worktreeRoot;
    const present: string[] = [];
    for (const rel of DEFAULT_PROTECTED) {
      if (await resolveWithinRoot(root, rel).catch(() => undefined)) present.push(rel);
    }
    const wanted = [...new Set([...this.ctx.testFiles, ...this.ctx.protectedConfigs, ...present])];
    for (const rel of wanted) {
      const real = await resolveWithinRoot(root, rel).catch(() => undefined);
      if (!real) throw new SealViolationError(`Sealed path is missing or escapes the worktree: ${rel}`);
    }
    this.sealedPaths = wanted.map((rel) => relative(root, resolve(root, rel)));
  }

  private async handleImplementation(): Promise<HarnessState> {
    const max = this.ctx.maxImplementerRetries ?? DEFAULTS.maxImplementerRetries;
    if (this.attempts >= max) return 'ABORTED';
    this.attempts++;

    const result = await this.runner.runImplementerStep(this.ctx);
    await this.verifySeal();
    await this.assertProduction(await this.changedProduction(result.modified));

    // Green tests need no arbitration, whatever the runner also reports.
    if (result.passed) return 'DIFF_MUTATION_GATE';
    return result.challenge ? this.routeChallenge(result.challenge) : 'IMPLEMENTATION_LOOP';
  }

  private routeChallenge(challenge: ChallengeCertificate): HarnessState {
    const minAttempts = this.ctx.minAttemptsBeforeChallenge ?? DEFAULTS.minAttemptsBeforeChallenge;
    const maxChallenges = this.ctx.maxChallengesAllowed ?? DEFAULTS.maxChallengesAllowed;
    if (this.attempts < minAttempts) return 'IMPLEMENTATION_LOOP';
    if (this.challengesUsed >= maxChallenges) return 'ABORTED';
    this.pendingChallenge = challenge;
    return 'BLIND_ARBITRATION';
  }

  private async handleArbitration(): Promise<HarnessState> {
    const challenge = this.pendingChallenge;
    this.pendingChallenge = null;
    if (!challenge) return 'IMPLEMENTATION_LOOP';
    this.challengesUsed++;

    const verdict = await this.runner.invokeBlindArbiter(challenge, this.ctx.taskCardPath);
    if (verdict.verdict === 'SPEC_AMBIGUITY') return 'BLOCKED_SPEC';
    if (verdict.verdict === 'UPHOLD_TEST_BUG') {
      this.pendingFix = verdict.authorFixInstruction;
      return 'TEST_AUTHORING';
    }
    return 'IMPLEMENTATION_LOOP';
  }

  private async handleMutation(): Promise<HarnessState> {
    await this.verifySeal();
    const killed = await this.runner.runDiffMutation(this.ctx);
    await this.verifySeal();
    return killed ? 'COMPLETED' : 'IMPLEMENTATION_LOOP';
  }
}
