/**
 * Bench runner (§3.1 / §3.6).
 *
 * Live model calls are opt-in (`live: true`). Default and CI paths use recorded
 * cells or a deterministic dry schedule. Cheap mode enforces OpenRouter
 * zero-spend lock before the run and between tasks.
 */
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadHarnessSuite } from '../harness-experiment';
import {
  assertOpenRouterUsageUnchanged,
  assertOpenRouterZeroSpend,
  DEFAULT_OPENROUTER_LIMIT_CAP_USD,
  type OpenRouterKeySnapshot,
} from '../../telemetry/openrouter-spend-lock';
import { createLcg } from './stats';
import {
  buildBenchReport,
  formatBenchReportMarkdown,
  type BenchClaim,
  type BenchReport,
  type BenchRunCell,
} from './report';
import {
  runClaudeHostCell,
  type ClaudeHostDiagnostics,
} from './host-claude';
import { PACKAGE_ROOT } from '../../presets/package-paths';

export interface PendingBenchCell {
  taskId: string;
  variant: 'baseline' | 'treatment';
  repetition: number;
  reason: string;
  diagnostics?: ClaudeHostDiagnostics;
}

export interface BenchInvocationRecord {
  taskId: string;
  variant: 'baseline' | 'treatment';
  repetition: number;
  ok: boolean;
  diagnostics: ClaudeHostDiagnostics;
}

export interface BenchRunOptions {
  projectRoot: string;
  suiteId?: string;
  suitePath?: string;
  /** Repetitions per task × variant (default 5). */
  n?: number;
  cheap?: boolean;
  claim?: BenchClaim;
  seed?: number;
  /**
   * When set, skip live hosts and build the report from these cells
   * (CI / unit tests / frozen baseline replay).
   */
  cells?: BenchRunCell[];
  /** Path to a JSON array of BenchRunCell (alternative to `cells`). */
  cellsPath?: string;
  /**
   * Emit a deterministic synthetic schedule (no host). Useful to freeze a
   * structural baseline hash without calling models.
   */
  drySynthetic?: boolean;
  /**
   * Opt-in live Claude Code host (OpenRouter :free). Requires cheap + key.
   * Incomplete cells are listed in `pendingCells`.
   */
  live?: boolean;
  maxLimitUsd?: number;
  /** Pre/post key snapshots for cheap-mode usage Δ (tests inject these). */
  keyBefore?: OpenRouterKeySnapshot | null;
  keyAfter?: OpenRouterKeySnapshot | null;
  fetchKey?: () => Promise<OpenRouterKeySnapshot | null>;
  modelId?: string;
  fingerprints?: BenchReport['fingerprints'];
  /** Directory outside the repo for bench-report.json (default XDG state). */
  reportDir?: string;
  writeReport?: boolean;
  /** Cap live cells (tests / partial baseline). */
  maxLiveCells?: number;
}

export interface BenchRunResult {
  report: BenchReport;
  markdown: string;
  reportPath: string | null;
  workDirs: string[];
  aborted: boolean;
  abortReason: string | null;
  runValid: boolean;
  pendingCells: PendingBenchCell[];
  invocations: BenchInvocationRecord[];
  usageBefore: number | null;
  usageAfter: number | null;
}

function defaultReportDir(projectRoot: string): string {
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
  const xdg = process.env.XDG_STATE_HOME ?? join(tmpdir(), 'cc-state');
  return join(xdg, 'codeconductor', hash, 'bench');
}

function interleaveSchedule(
  taskIds: string[],
  n: number,
  seed: number,
): Array<{ taskId: string; variant: 'baseline' | 'treatment'; repetition: number }> {
  const rng = createLcg(seed);
  const slots: Array<{ taskId: string; variant: 'baseline' | 'treatment'; repetition: number }> =
    [];
  for (const taskId of taskIds) {
    for (let rep = 1; rep <= n; rep++) {
      slots.push({ taskId, variant: 'baseline', repetition: rep });
      slots.push({ taskId, variant: 'treatment', repetition: rep });
    }
  }
  // Fisher–Yates with seeded RNG, but keep A/B pairs adjacent when possible:
  // shuffle pair order only.
  const pairs: typeof slots[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i]!, slots[i + 1]!]);
  }
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pairs[i]!;
    pairs[i] = pairs[j]!;
    pairs[j] = tmp;
  }
  return pairs.flat();
}

/** Deterministic synthetic cells for structural baseline freeze (no models). */
export function synthesizeDryCells(
  taskIds: string[],
  n: number,
  seed: number,
): BenchRunCell[] {
  const schedule = interleaveSchedule(taskIds, n, seed);
  const rng = createLcg(seed ^ 0x9e3779b9);
  return schedule.map((slot) => {
    const baseTokens = 1000 + Math.floor(rng() * 200);
    const treatTokens = baseTokens - 50 + Math.floor(rng() * 40);
    const tokens =
      slot.variant === 'baseline' ? baseTokens : Math.max(100, treatTokens);
    return {
      taskId: slot.taskId,
      variant: slot.variant,
      repetition: slot.repetition,
      success: true,
      iterations: 1,
      retries: 0,
      calls: 1,
      tokensTotal: tokens,
      tokensInput: Math.floor(tokens * 0.8),
      tokensOutput: Math.floor(tokens * 0.2),
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      costUsd: 0,
      costBasis: 'none',
      durationMs: 100 + Math.floor(rng() * 50),
      cacheHitRate: 0,
      firstTry: true,
      modelId: 'dry-synthetic',
      hostVersion: null,
    };
  });
}

async function loadCells(options: BenchRunOptions): Promise<BenchRunCell[] | null> {
  if (options.cells) return options.cells;
  if (options.cellsPath) {
    const raw = JSON.parse(await readFile(options.cellsPath, 'utf-8')) as unknown;
    if (!Array.isArray(raw)) throw new Error('cellsPath must be a JSON array');
    return raw as BenchRunCell[];
  }
  return null;
}

/**
 * Run (or replay) a bench. Pass `drySynthetic`, `cells`/`cellsPath`, or
 * `live: true` (cheap OpenRouter :free via Claude Code). Cheap mode enforces
 * the OpenRouter ≤$5 / Δ usage $0 lock before the run and between tasks.
 */
export async function runBench(options: BenchRunOptions): Promise<BenchRunResult> {
  const projectRoot = options.projectRoot;
  const suiteId = options.suiteId ?? 'harness-v1';
  const cheap = options.cheap === true;
  // §3.1: N=5 default; cheap mode uses N=3 unless caller overrides.
  const n = options.n ?? (cheap ? 3 : 5);
  const seed = options.seed ?? 42;
  const workDirs: string[] = [];
  const pendingCells: PendingBenchCell[] = [];
  const invocations: BenchInvocationRecord[] = [];
  let usageAfter: number | null = null;

  const suite = await loadHarnessSuite(projectRoot, suiteId, options.suitePath);
  if (!suite.success) {
    throw suite.error;
  }
  const taskIds = suite.data.tasks.map((t) => t.id);
  const taskById = new Map(suite.data.tasks.map((t) => [t.id, t]));

  // Copy fixture to /tmp (clean workdir per §3.1) — even for dry runs, to
  // exercise the isolation path.
  const fixtureDir = suite.data.fixtureDir
    ? resolve(
        options.suitePath
          ? resolve(options.suitePath, '..')
          : resolve(PACKAGE_ROOT, 'eval', 'suites', suiteId),
        suite.data.fixtureDir,
      )
    : null;
  if (fixtureDir) {
    const wt = await mkdtemp(join(tmpdir(), 'cc-bench-'));
    workDirs.push(wt);
    await cp(fixtureDir, join(wt, 'fixture'), { recursive: true });
  }

  let usageBefore: number | null = null;
  let runValid = true;
  let aborted = false;
  let abortReason: string | null = null;
  const modelId =
    options.modelId ?? 'nvidia/nemotron-3-super-120b-a12b:free';

  if (cheap) {
    const lock = await assertOpenRouterZeroSpend({
      modelId,
      key: options.keyBefore,
      fetchKey: options.fetchKey,
      maxLimitUsd: options.maxLimitUsd ?? DEFAULT_OPENROUTER_LIMIT_CAP_USD,
      skipKeyCheck:
        options.keyBefore === undefined &&
        !options.fetchKey &&
        !process.env.OPENROUTER_API_KEY &&
        options.live !== true,
    });
    if (!lock.ok) {
      aborted = true;
      abortReason = lock.reason;
      runValid = false;
    } else {
      usageBefore = lock.usageBefore;
    }
  }

  let cells = await loadCells(options);
  if (!cells) {
    if (options.live === true) {
      if (!cheap) {
        aborted = true;
        abortReason = 'live bench requires --cheap (OpenRouter :free lock)';
        runValid = false;
        cells = [];
      } else if (!fixtureDir) {
        aborted = true;
        abortReason = 'live bench requires suite fixtureDir';
        runValid = false;
        cells = [];
      } else if (aborted) {
        cells = [];
      } else {
        const schedule = interleaveSchedule(taskIds, n, seed);
        const maxLive = options.maxLiveCells ?? schedule.length;
        cells = [];
        let lastTaskId: string | null = null;
        let consecutiveHostFailures = 0;
        try {
          for (let i = 0; i < schedule.length; i++) {
            const slot = schedule[i]!;
            if (i >= maxLive) {
              pendingCells.push({
                taskId: slot.taskId,
                variant: slot.variant,
                repetition: slot.repetition,
                reason: 'not reached (maxLiveCells / quota)',
              });
              continue;
            }
            if (aborted) {
              pendingCells.push({
                taskId: slot.taskId,
                variant: slot.variant,
                repetition: slot.repetition,
                reason: abortReason ?? 'aborted',
              });
              continue;
            }

            // Between-task usage check when the task id changes.
            if (
              lastTaskId !== null &&
              slot.taskId !== lastTaskId &&
              usageBefore !== null
            ) {
              const mid = await assertOpenRouterUsageUnchanged({
                usageBefore,
                keyAfter: options.keyAfter,
                fetchKey: options.fetchKey,
              });
              if (!mid.ok) {
                aborted = true;
                abortReason = `after task ${lastTaskId}: ${mid.reason}`;
                runValid = false;
                pendingCells.push({
                  taskId: slot.taskId,
                  variant: slot.variant,
                  repetition: slot.repetition,
                  reason: abortReason,
                });
                continue;
              }
            }
            lastTaskId = slot.taskId;

            const task = taskById.get(slot.taskId);
            const hostResult = await runClaudeHostCell(
              {
                taskId: slot.taskId,
                variant: slot.variant,
                repetition: slot.repetition,
                prompt: task?.prompt ?? slot.taskId,
                testCommand: task?.testCommand,
              },
              {
                fixtureDir,
                modelId,
                hostVersion: process.env.CLAUDE_CODE_VERSION ?? null,
                maxAttempts: 2,
              },
            );
            invocations.push({
              taskId: slot.taskId,
              variant: slot.variant,
              repetition: slot.repetition,
              ok: !hostResult.pending && hostResult.cell !== null,
              diagnostics: hostResult.diagnostics,
            });
            if (hostResult.pending || !hostResult.cell) {
              consecutiveHostFailures += 1;
              pendingCells.push({
                taskId: slot.taskId,
                variant: slot.variant,
                repetition: slot.repetition,
                reason: hostResult.pendingReason ?? 'host pending',
                diagnostics: hostResult.diagnostics,
              });
              // After 2 failed host slots with zero valid cells, stop (Arturo).
              if (cells.length === 0 && consecutiveHostFailures >= 2) {
                aborted = true;
                abortReason =
                  `no valid cells after ${consecutiveHostFailures} host attempts — ` +
                  `exit=${hostResult.diagnostics.exitCode} ` +
                  `timedOut=${hostResult.diagnostics.timedOut} ` +
                  `429=${hostResult.diagnostics.http429} ` +
                  `subtype=${hostResult.diagnostics.subtype} ` +
                  `is_error=${hostResult.diagnostics.isError} ` +
                  `stderr=${hostResult.diagnostics.stderrTruncated ?? ''}`;
                runValid = false;
              }
              continue;
            }
            consecutiveHostFailures = 0;
            cells.push(hostResult.cell);
          }
        } finally {
          // Post-candado always runs when we had a usage baseline (even on abort).
          if (usageBefore !== null) {
            try {
              const after = await assertOpenRouterUsageUnchanged({
                usageBefore,
                keyAfter: options.keyAfter,
                fetchKey: options.fetchKey,
              });
              usageAfter = after.usageAfter;
              if (!after.ok) {
                aborted = true;
                abortReason = after.reason ?? abortReason;
                runValid = false;
              }
            } catch (err) {
              aborted = true;
              abortReason =
                err instanceof Error
                  ? err.message
                  : 'post-run usage check failed';
              runValid = false;
            }
          }
        }
      }
    } else if (options.drySynthetic || !cheap) {
      cells = synthesizeDryCells(taskIds, n, seed);
    } else if (!aborted) {
      aborted = true;
      abortReason =
        'Live bench requires --live (or pass --dry-synthetic / --cells)';
      runValid = false;
      cells = [];
    } else {
      cells = [];
    }
  }

  // Dry / cells path: re-check usage between tasks so a mid-run Δ aborts.
  if (!options.live && cheap && !aborted && usageBefore !== null) {
    for (const taskId of taskIds) {
      const after = await assertOpenRouterUsageUnchanged({
        usageBefore,
        keyAfter: options.keyAfter,
        fetchKey: options.fetchKey,
      });
      usageAfter = after.usageAfter;
      if (!after.ok) {
        aborted = true;
        abortReason = `after task ${taskId}: ${after.reason}`;
        runValid = false;
        break;
      }
    }
  }

  const report = buildBenchReport({
    suiteId,
    cells,
    fingerprints: options.fingerprints ?? {
      harness: null,
      prompt: null,
      host: null,
      model: options.modelId ?? (cheap ? 'openrouter:free' : 'dry-synthetic'),
      pricingVersion: null,
    },
    claim: options.claim ?? 'success-only',
    cheap,
    seed,
  });

  const markdown = formatBenchReportMarkdown(report);
  let reportPath: string | null = null;
  // Always write aggregates (including empty / aborted) for Actions artifacts.
  if (options.writeReport !== false) {
    const dir = options.reportDir ?? defaultReportDir(projectRoot);
    await mkdir(dir, { recursive: true });
    reportPath = join(dir, 'bench-report.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    await writeFile(join(dir, 'bench-report.md'), markdown, 'utf-8');
  }

  // Cleanup workdirs
  for (const d of workDirs) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    report,
    markdown,
    reportPath,
    workDirs,
    aborted,
    abortReason,
    runValid: runValid && !aborted,
    pendingCells,
    invocations,
    usageBefore,
    usageAfter,
  };
}
