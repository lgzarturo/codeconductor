import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { GoalGraphInput } from '../../validation/schemas';
import {
  EvidenceSchema,
  ImplementerTestsSchema,
  ReviewerOutputSchema,
  type EvidenceInput,
} from '../../validation/schemas';
import { loadConfig } from '../config/config-loader';
import {
  isAllowlistedCompileCommand,
  isAllowlistedTestCommand,
  runCompileCheck,
} from '../compilation/compile-checker';
import type { TddSuiteEvidence } from '../../domain/loop/loop-state';
import { err, ok, type Result } from '../../utils/result';
import { evidenceDir } from '../product-graph/paths';
import { appendEvent } from '../memory/episodic-store';
import { mkdir, readdir, writeFile } from 'node:fs/promises';

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Evidence stored for a task. `invalid` counts files that could not be read or
 * did not match EvidenceSchema — they make verification and gating fail closed
 * instead of being silently skipped.
 */
interface TaskEvidence {
  records: EvidenceInput[];
  invalid: number;
}

/**
 * Whether an evidence record proves a successful outcome.
 *
 * The payload must match the shape the producing agent emits — the tests
 * section of `ImplementerOutputSchema` for a test run, `ReviewerOutputSchema`
 * for a review — so a bare `passed` flag cannot stand in for a real result.
 */
function isPassingEvidence(ev: EvidenceInput): boolean {
  switch (ev.type) {
    case 'verification':
      return ev.data?.passed === true;
    case 'test': {
      const tests = ImplementerTestsSchema.safeParse(ev.data);
      return tests.success && tests.data.result === 'passed';
    }
    case 'review': {
      const review = ReviewerOutputSchema.safeParse(ev.data);
      return review.success && review.data.status === 'pass' && review.data.verdict !== 'blocked';
    }
    default:
      return false;
  }
}

/**
 * Resolve the file backing an evidence record. Ids are derived from task ids,
 * which are user input, so the name is reduced to a single safe segment and
 * the result is confirmed to stay inside the evidence directory. The record
 * itself keeps its raw id and `relatedTask`.
 */
function evidenceFilePath(evDir: string, id: string): Result<string, Error> {
  const path = resolve(evDir, `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  if (dirname(path) !== resolve(evDir)) {
    return err(new Error(`Refusing to write evidence for "${id}" outside ${evDir}`));
  }
  return ok(path);
}

async function persistEvidence(
  projectRoot: string,
  evidence: EvidenceInput,
): Promise<Result<void, Error>> {
  const evDir = evidenceDir(projectRoot);
  const evidencePath = evidenceFilePath(evDir, evidence.id);
  if (!evidencePath.success) return evidencePath;
  try {
    await mkdir(evDir, { recursive: true });
    await writeFile(evidencePath.data, JSON.stringify(evidence, null, 2), 'utf-8');
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
  return ok(undefined);
}

async function collectTaskEvidence(
  projectRoot: string,
  taskId: string,
): Promise<Result<TaskEvidence, Error>> {
  const evDir = evidenceDir(projectRoot);
  const records: EvidenceInput[] = [];
  let invalid = 0;

  if (!existsSync(evDir)) return ok({ records, invalid });

  let files: string[];
  try {
    files = await readdir(evDir);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(evDir, file), 'utf-8');
      const ev = EvidenceSchema.parse(JSON.parse(raw));
      if (ev.relatedTask === taskId) records.push(ev);
    } catch {
      invalid++;
    }
  }

  return ok({ records, invalid });
}

/**
 * Check that ids handed to a completion really name evidence of this task.
 *
 * Every id must resolve to a stored record that parses as `EvidenceSchema`,
 * carries that exact id, is related to this task and records a passing result —
 * and at least one cited id must be a passing `verification` record, so
 * supporting test/review evidence alone cannot stand in for verification.
 */
export async function validateEvidenceIds(
  projectRoot: string,
  taskId: string,
  evidenceIds: string[],
): Promise<Result<void, Error>> {
  const collected = await collectTaskEvidence(projectRoot, taskId);
  if (!collected.success) return collected;

  const owned = new Map(collected.data.records.map((ev) => [ev.id, ev]));
  let hasPassingVerification = false;
  for (const id of evidenceIds) {
    const record = owned.get(id);
    if (!record) {
      return err(new Error(`Evidence "${id}" is not a record of task ${taskId}`));
    }
    if (!isPassingEvidence(record)) {
      return err(new Error(`Evidence "${id}" does not record a passing result`));
    }
    if (record.type === 'verification') hasPassingVerification = true;
  }

  if (!hasPassingVerification) {
    return err(new Error(`Task ${taskId} requires at least one passing verification evidence`));
  }

  return ok(undefined);
}

export interface RunVerificationOptions {
  /**
   * Explicit trust to execute the compile command configured by the analyzed
   * project itself (`.codeconductor/config.yml`). Without this opt-in the
   * command is executed only if it matches the compile allowlist
   * (`tsc`, `bun run`, `npm test`, …). Anything else fails closed.
   */
  readonly allowCompileCheck?: boolean;
}

export async function runVerification(
  projectRoot: string,
  taskId: string,
  goal?: GoalGraphInput,
  options?: RunVerificationOptions,
): Promise<Result<{ passed: boolean; checks: VerificationCheck[]; evidenceIds: string[] }, Error>> {
  const checks: VerificationCheck[] = [];
  const evidenceIds: string[] = [];

  let task: GoalGraphInput['tasks'][0] | undefined;
  if (goal) {
    task = goal.tasks.find((t) => t.id === taskId);
  } else {
    const { loadGoal } = await import('../goal/goal-state');
    const g = await loadGoal(projectRoot);
    if (!g.success) return g;
    task = g.data.tasks.find((t) => t.id === taskId);
  }

  if (!task) {
    return err(new Error(`Task ${taskId} not found in goal`));
  }

  // Acceptance criteria checklist
  const criteriaCount = task.acceptance_criteria.length;
  checks.push({
    name: 'acceptance_criteria_defined',
    passed: criteriaCount > 0,
    message:
      criteriaCount > 0
        ? `${criteriaCount} acceptance criteria defined`
        : 'No acceptance criteria defined',
  });

  // Compile check from config — a config that cannot be read is never a pass
  const configResult = await loadConfig(projectRoot);
  if (!configResult.success) {
    checks.push({
      name: 'config_loaded',
      passed: false,
      message: `Cannot load config: ${configResult.error.message}`,
    });
  } else {
    const compileCheck = configResult.data.safety.compileCheck;
    if (!compileCheck?.enabled) {
      checks.push({
        name: 'compile_check',
        passed: true,
        message: 'Compile check not enabled',
      });
    } else if (!compileCheck.command) {
      checks.push({
        name: 'compile_check',
        passed: false,
        message: 'Compile check enabled but no command configured',
      });
    } else if (
      !options?.allowCompileCheck &&
      !isAllowlistedCompileCommand(compileCheck.command)
    ) {
      checks.push({
        name: 'compile_check',
        passed: false,
        message:
          'Compile check not executed: the command is not on the compile allowlist. ' +
          'Re-run with --allow-compile-check to trust it.',
      });
    } else {
      const compile = await runCompileCheck({
        command: compileCheck.command,
        cwd: projectRoot,
        timeoutMs: compileCheck.timeoutMs,
      });
      checks.push({
        name: 'compile_check',
        passed: compile.success && !compile.timedOut,
        message: compile.timedOut
          ? `Compile check timed out: ${compileCheck.command}`
          : compile.success
            ? `Compile check passed: ${compileCheck.command}`
            : `Compile check failed (exit ${compile.exitCode}): ${compileCheck.command}`,
      });
    }
  }

  // Evidence files for task
  const collected = await collectTaskEvidence(projectRoot, taskId);
  if (!collected.success) return collected;

  checks.push({
    name: 'evidence_readable',
    passed: collected.data.invalid === 0,
    message:
      collected.data.invalid === 0
        ? 'All evidence records are readable'
        : `${collected.data.invalid} unreadable evidence record(s)`,
  });

  // Verification records are written by this runner, so counting them would let
  // a previous run vouch for the next one. Only external, passing evidence counts.
  const supporting = collected.data.records.filter(
    (ev) => ev.type !== 'verification' && isPassingEvidence(ev),
  );
  evidenceIds.push(...supporting.map((ev) => ev.id));

  checks.push({
    name: 'evidence_present',
    passed: supporting.length > 0 || task.risk === 'low',
    message:
      supporting.length > 0
        ? `${supporting.length} passing evidence record(s) for task`
        : task.risk === 'low'
          ? 'Low risk task — evidence optional'
          : 'No passing evidence records found for task',
  });

  const passed = checks.every((c) => c.passed);

  const evidence: EvidenceInput = {
    id: `ev-verify-${taskId}-${Date.now()}`,
    source: 'cc verify',
    type: 'verification',
    timestamp: new Date().toISOString(),
    relatedTask: taskId,
    confidence: passed ? 0.9 : 0.3,
    summary: passed ? 'Verification passed' : 'Verification failed',
    data: { passed, checks },
  };

  const persisted = await persistEvidence(projectRoot, evidence);
  if (!persisted.success) return persisted;
  if (passed) evidenceIds.push(evidence.id);

  const event = await appendEvent(projectRoot, {
    type: 'verification.completed',
    timestamp: new Date().toISOString(),
    payload: { taskId, passed, evidenceId: evidence.id },
  });
  if (!event.success) return event;

  return ok({ passed, checks, evidenceIds });
}

/**
 * Decide whether a task may be completed.
 *
 * A requirement is only satisfied by evidence of the matching type whose
 * payload proves success. Unknown requirements, missing evidence and
 * unreadable evidence all block completion.
 */
export async function gateTaskCompletion(
  projectRoot: string,
  taskId: string,
  evidenceRequired: string[],
  evidenceIds?: string[],
): Promise<Result<boolean, Error>> {
  const collected = await collectTaskEvidence(projectRoot, taskId);
  if (!collected.success) return collected;
  if (collected.data.invalid > 0) return ok(false);

  const cited = evidenceIds ? new Set(evidenceIds) : undefined;
  const hasPassing = (type: string): boolean =>
    collected.data.records.some(
      (ev) => (!cited || cited.has(ev.id)) && ev.type === type && isPassingEvidence(ev),
    );

  for (const req of evidenceRequired) {
    switch (req) {
      case 'acceptance_criteria_met':
        if (!hasPassing('verification')) return ok(false);
        break;
      case 'tests_passed':
        if (!hasPassing('test')) return ok(false);
        break;
      case 'review_approved':
        if (!hasPassing('review')) return ok(false);
        break;
      default:
        return ok(false);
    }
  }

  return ok(true);
}

const TDD_EVIDENCE_SOURCE = 'cc verify';
const TDD_CAPTURED_BY = 'verification-runner';

export interface CaptureTddSuiteOptions extends RunVerificationOptions {
  /** Allowlisted test command (`bun test`, `npm test`, …). */
  readonly command: string;
}

/**
 * Run a test suite and store TDD evidence. Only this function writes records
 * that `tddCycleStateMachine` will accept as RED/GREEN gates.
 */
export async function captureTddSuiteEvidence(
  projectRoot: string,
  taskId: string,
  options: CaptureTddSuiteOptions,
): Promise<
  Result<
    {
      evidenceId: string;
      suiteFailed: boolean;
      suitePassed: boolean;
    },
    Error
  >
> {
  if (!options.allowCompileCheck && !isAllowlistedTestCommand(options.command)) {
    return err(
      new Error(
        'TDD suite command is not on the test allowlist. Re-run with --allow-compile-check to trust it.',
      ),
    );
  }

  const result = await runCompileCheck({
    command: options.command,
    cwd: projectRoot,
  });

  const suitePassed = result.success && !result.timedOut && result.exitCode === 0;
  const suiteFailed = !result.timedOut && result.exitCode !== 0;

  const evidence: EvidenceInput = {
    id: `ev-tdd-${taskId}-${Date.now()}`,
    source: TDD_EVIDENCE_SOURCE,
    type: 'tdd',
    timestamp: new Date().toISOString(),
    relatedTask: taskId,
    confidence: suitePassed || suiteFailed ? 0.9 : 0.3,
    summary: suitePassed
      ? 'TDD suite passed'
      : suiteFailed
        ? 'TDD suite failed'
        : 'TDD suite inconclusive',
    data: {
      capturedBy: TDD_CAPTURED_BY,
      suiteFailed,
      suitePassed,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      command: options.command,
    },
  };

  const persisted = await persistEvidence(projectRoot, evidence);
  if (!persisted.success) return persisted;

  const event = await appendEvent(projectRoot, {
    type: 'verification.completed',
    timestamp: new Date().toISOString(),
    payload: {
      taskId,
      tdd: true,
      suiteFailed,
      suitePassed,
      evidenceId: evidence.id,
    },
  });
  if (!event.success) return event;

  return ok({
    evidenceId: evidence.id,
    suiteFailed,
    suitePassed,
  });
}

/**
 * Load TDD suite evidence written by `captureTddSuiteEvidence`. Hand-edited
 * files (wrong source/type/`capturedBy`) are rejected.
 */
export async function loadTddSuiteEvidence(
  projectRoot: string,
  taskId: string,
  evidenceId: string,
): Promise<Result<TddSuiteEvidence, Error>> {
  const evDir = evidenceDir(projectRoot);
  const path = evidenceFilePath(evDir, evidenceId);
  if (!path.success) return path;

  let raw: string;
  try {
    raw = await readFile(path.data, 'utf-8');
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }

  let ev: EvidenceInput;
  try {
    ev = EvidenceSchema.parse(JSON.parse(raw));
  } catch {
    return err(new Error(`Evidence "${evidenceId}" is not valid TDD evidence`));
  }

  if (ev.relatedTask !== taskId) {
    return err(new Error(`Evidence "${evidenceId}" is not a record of task ${taskId}`));
  }
  if (ev.type !== 'tdd' || ev.source !== TDD_EVIDENCE_SOURCE) {
    return err(new Error(`Evidence "${evidenceId}" was not captured by the verification runner`));
  }

  const capturedBy = ev.data?.capturedBy;
  const suiteFailed = ev.data?.suiteFailed;
  const suitePassed = ev.data?.suitePassed;
  if (
    capturedBy !== TDD_CAPTURED_BY ||
    typeof suiteFailed !== 'boolean' ||
    typeof suitePassed !== 'boolean'
  ) {
    return err(new Error(`Evidence "${evidenceId}" was not captured by the verification runner`));
  }

  return ok({ capturedBy, suiteFailed, suitePassed });
}
