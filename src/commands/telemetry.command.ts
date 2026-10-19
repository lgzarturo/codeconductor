/**
 * `cc-codeconductor telemetry otel-env|show|purge`
 */
import { buildOtelEnv } from '../core/telemetry/otel-env';
import {
  listTelemetryRunIds,
  purgeTelemetry,
  readTelemetryRun,
  reportsRunsPath,
} from '../core/telemetry/store';
import type { OutputMode } from '../utils/logger';

export type TelemetrySubcommand = 'otel-env' | 'show' | 'purge';

export interface TelemetryOptions {
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly subcommand: TelemetrySubcommand;
  readonly port?: number;
  readonly withToolDetails?: boolean;
  readonly purgeScope?: 'project' | 'all';
  readonly runId?: string;
}

export async function telemetryCommand(
  options: TelemetryOptions,
): Promise<{ code: number; data?: unknown }> {
  switch (options.subcommand) {
    case 'otel-env':
      return otelEnv(options);
    case 'show':
      return show(options);
    case 'purge':
      return purge(options);
    default: {
      const _exhaustive: never = options.subcommand;
      return {
        code: 1,
        data: { success: false, errors: [`Unknown telemetry subcommand: ${String(_exhaustive)}`] },
      };
    }
  }
}

function otelEnv(options: TelemetryOptions): { code: number; data: unknown } {
  const built = buildOtelEnv({
    port: options.port,
    withToolDetails: options.withToolDetails === true,
  });

  if (options.output === 'json') {
    return {
      code: 0,
      data: {
        success: true,
        command: 'telemetry otel-env',
        endpoint: built.endpoint,
        vars: built.vars,
        exportLines: built.exportLines,
        notes: built.notes,
        forbiddenUnset: built.exportLines.filter((l) => l.startsWith('unset ')),
      },
    };
  }

  // Human / shell: print export lines to stdout so `eval "$(… otel-env)"` works.
  // Notes go to stderr so they do not pollute eval.
  for (const line of built.exportLines) {
    process.stdout.write(`${line}\n`);
  }
  for (const note of built.notes) {
    process.stderr.write(`# ${note}\n`);
  }
  return {
    code: 0,
    data: {
      success: true,
      command: 'telemetry otel-env',
      endpoint: built.endpoint,
    },
  };
}

async function show(options: TelemetryOptions): Promise<{ code: number; data: unknown }> {
  const runIds = await listTelemetryRunIds(options.projectRoot);
  const selected = options.runId ? runIds.filter((id) => id === options.runId) : runIds;
  const runs: Array<{
    runId: string;
    events: number;
    byEvent: Record<string, number>;
  }> = [];

  for (const runId of selected) {
    const listed = await readTelemetryRun(options.projectRoot, runId);
    if (!listed.success) continue;
    const byEvent: Record<string, number> = {};
    for (const ev of listed.data) {
      byEvent[ev.event] = (byEvent[ev.event] ?? 0) + 1;
    }
    runs.push({ runId, events: listed.data.length, byEvent });
  }

  const data = {
    success: true,
    command: 'telemetry show',
    telemetryDir: '.codeconductor/telemetry/',
    reportsPath: reportsRunsPath(options.projectRoot),
    runCount: runs.length,
    runs,
  };

  if (options.output === 'human') {
    const lines = [
      `Telemetry runs: ${runs.length}`,
      ...runs.map(
        (r) =>
          `  ${r.runId}  events=${r.events}  ` +
          Object.entries(r.byEvent)
            .map(([k, v]) => `${k}:${v}`)
            .join(' '),
      ),
    ];
    return { code: 0, data: { ...data, output: lines.join('\n') } };
  }
  return { code: 0, data };
}

async function purge(options: TelemetryOptions): Promise<{ code: number; data: unknown }> {
  const scope = options.purgeScope ?? 'project';
  const result = await purgeTelemetry(options.projectRoot, scope);
  if (!result.success) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'telemetry purge',
        errors: [result.error.message],
      },
    };
  }
  return {
    code: 0,
    data: {
      success: true,
      command: 'telemetry purge',
      scope,
      message: `Purged telemetry history (${scope}).`,
    },
  };
}
