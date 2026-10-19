/**
 * Telemetry store — writes under .codeconductor/telemetry/ and reports/.
 * Respects report.history=false (no writes) and privacy scrubbing (§7).
 */
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { err, ok, type Result } from '../../utils/result';
import {
  assertHarnessTelemetryEvent,
  type HarnessTelemetryEvent,
  type PrivacyMode,
  isHarnessTelemetryEvent,
} from './schema';

const TELEMETRY_DIR = '.codeconductor/telemetry';
const REPORTS_DIR = '.codeconductor/reports';
const RUNS_FILE = 'runs.jsonl';
const PROJECT_CONFIG = '.codeconductor/config.yml';

export interface TelemetryWriteOptions {
  /** When false, nothing is written. Defaults to resolved report.history. */
  history?: boolean;
  privacy?: PrivacyMode;
}

export interface ReportSettings {
  level: 'off' | 'minimal' | 'detailed';
  history: boolean;
  privacy: PrivacyMode;
}

const DEFAULT_REPORT: ReportSettings = {
  level: 'off',
  history: true,
  privacy: 'standard',
};

/**
 * Resolve report settings. Any history:false wins (env, project, or options).
 * Env: CC_REPORT_HISTORY=false | CC_REPORT=off (does not itself disable history).
 */
export async function resolveReportSettings(
  projectRoot: string,
  overrides: Partial<ReportSettings> = {},
): Promise<ReportSettings> {
  let project: Partial<ReportSettings> = {};
  try {
    const raw = await readFile(resolve(projectRoot, PROJECT_CONFIG), 'utf-8');
    const data = parseYaml(raw) as { report?: Record<string, unknown> } | null;
    if (data?.report && typeof data.report === 'object') {
      const r = data.report;
      project = {
        level:
          r.level === 'off' || r.level === 'minimal' || r.level === 'detailed'
            ? r.level
            : undefined,
        history: typeof r.history === 'boolean' ? r.history : undefined,
        privacy: r.privacy === 'standard' || r.privacy === 'strict' ? r.privacy : undefined,
      };
    }
  } catch {
    // missing or unreadable config → defaults
  }

  const envHistory = process.env.CC_REPORT_HISTORY;
  const envPrivacy = process.env.CC_REPORT_PRIVACY;
  const envLevel = process.env.CC_REPORT;

  const level =
    overrides.level ??
    (envLevel === 'off' || envLevel === 'minimal' || envLevel === 'detailed'
      ? envLevel
      : undefined) ??
    project.level ??
    DEFAULT_REPORT.level;

  // Any explicit false wins over true (Orca/Herdr §4.3).
  const historyCandidates = [
    overrides.history,
    envHistory === 'false' ? false : envHistory === 'true' ? true : undefined,
    project.history,
    DEFAULT_REPORT.history,
  ].filter((v): v is boolean => typeof v === 'boolean');
  const history = historyCandidates.includes(false)
    ? false
    : (historyCandidates[0] ?? DEFAULT_REPORT.history);

  const privacy =
    overrides.privacy ??
    (envPrivacy === 'standard' || envPrivacy === 'strict' ? envPrivacy : undefined) ??
    project.privacy ??
    DEFAULT_REPORT.privacy;

  return { level, history, privacy };
}

/** Apply §7 privacy scrubbing. Does not store prompts, responses, diffs, or tool output. */
export function applyPrivacy(
  event: HarnessTelemetryEvent,
  privacy: PrivacyMode,
): HarnessTelemetryEvent {
  const next: HarnessTelemetryEvent = { ...event, privacy };
  if (privacy !== 'strict') {
    if (next.loop?.retryReason && next.loop.retryReason.length > 120) {
      next.loop = { ...next.loop, retryReason: next.loop.retryReason.slice(0, 120) };
    }
    return next;
  }

  // strict: strip model id, paths-like retry reasons, session-ish agent ids
  next.model = next.model
    ? { id: null, provider: next.model.provider, effort: next.model.effort }
    : null;
  next.agent = next.agent ? { role: next.agent.role, agentId: null } : null;
  if (next.loop?.retryReason) {
    const hash = createHash('sha256').update(next.loop.retryReason).digest('hex').slice(0, 16);
    next.loop = { ...next.loop, retryReason: `sha256:${hash}` };
  }
  return next;
}

export async function ensureTelemetryDirs(projectRoot: string): Promise<{
  telemetryDir: string;
  reportsDir: string;
}> {
  const telemetryDir = resolve(projectRoot, TELEMETRY_DIR);
  const reportsDir = resolve(projectRoot, REPORTS_DIR);
  await mkdir(telemetryDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  return { telemetryDir, reportsDir };
}

export function telemetryRunPath(projectRoot: string, runId: string): string {
  const safe = runId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return resolve(projectRoot, TELEMETRY_DIR, `${safe}.jsonl`);
}

export function reportsRunsPath(projectRoot: string): string {
  return resolve(projectRoot, REPORTS_DIR, RUNS_FILE);
}

/**
 * Append a telemetry event. No-op when history is false.
 */
export async function appendTelemetryEvent(
  projectRoot: string,
  event: HarnessTelemetryEvent,
  options: TelemetryWriteOptions = {},
): Promise<Result<{ written: boolean; path: string | null }, Error>> {
  try {
    const settings = await resolveReportSettings(projectRoot, {
      history: options.history,
      privacy: options.privacy,
    });
    if (!settings.history) {
      return ok({ written: false, path: null });
    }

    const validated = assertHarnessTelemetryEvent(event);
    const scrubbed = applyPrivacy(validated, options.privacy ?? settings.privacy);
    const { telemetryDir } = await ensureTelemetryDirs(projectRoot);
    const path = telemetryRunPath(projectRoot, scrubbed.runId);
    await mkdir(telemetryDir, { recursive: true });
    await appendFile(path, JSON.stringify(scrubbed) + '\n', 'utf-8');
    return ok({ written: true, path });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Append a run-report line to .codeconductor/reports/runs.jsonl.
 * No-op when history is false.
 */
export async function appendRunReport(
  projectRoot: string,
  report: Record<string, unknown>,
  options: TelemetryWriteOptions = {},
): Promise<Result<{ written: boolean }, Error>> {
  try {
    const settings = await resolveReportSettings(projectRoot, {
      history: options.history,
      privacy: options.privacy,
    });
    if (!settings.history) {
      return ok({ written: false });
    }
    const { reportsDir } = await ensureTelemetryDirs(projectRoot);
    const path = join(reportsDir, RUNS_FILE);
    await appendFile(path, JSON.stringify(report) + '\n', 'utf-8');
    return ok({ written: true });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function readTelemetryRun(
  projectRoot: string,
  runId: string,
): Promise<Result<HarnessTelemetryEvent[], Error>> {
  try {
    const path = telemetryRunPath(projectRoot, runId);
    const content = await readFile(path, 'utf-8');
    const events: HarnessTelemetryEvent[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const parsed: unknown = JSON.parse(line);
      if (isHarnessTelemetryEvent(parsed)) events.push(parsed);
    }
    return ok(events);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ok([]);
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function listTelemetryRunIds(projectRoot: string): Promise<string[]> {
  try {
    const dir = resolve(projectRoot, TELEMETRY_DIR);
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith('.jsonl')).map((f) => f.replace(/\.jsonl$/, ''));
  } catch {
    return [];
  }
}

/** Delete project telemetry + reports history (local only). */
export async function purgeTelemetry(
  projectRoot: string,
  scope: 'project' | 'all' = 'project',
): Promise<Result<void, Error>> {
  try {
    const dirs = [resolve(projectRoot, TELEMETRY_DIR), resolve(projectRoot, REPORTS_DIR)];
    if (scope === 'all') {
      dirs.push(resolve(homedir(), '.local', 'share', 'codeconductor'));
    }
    for (const dir of dirs) {
      let files: string[];
      try {
        files = await readdir(dir);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          await unlink(resolve(dir, file));
        }
      }
      // leave empty dirs; recreate marker
      await writeFile(resolve(dir, '.keep'), '', 'utf-8').catch(() => undefined);
    }
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
