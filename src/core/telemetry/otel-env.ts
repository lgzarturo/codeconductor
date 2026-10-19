/**
 * Shell env vars for Claude Code → local OTLP http/json.
 * Prints only — never writes to the repo or settings files.
 * Privacy §7: never enable content-logging OTEL_LOG_* vars.
 */

export const FORBIDDEN_OTEL_LOG_VARS = [
  'OTEL_LOG_USER_PROMPTS',
  'OTEL_LOG_ASSISTANT_RESPONSES',
  'OTEL_LOG_TOOL_CONTENT',
  'OTEL_LOG_RAW_API_BODIES',
] as const;

export interface OtelEnvOptions {
  /** Local OTLP HTTP endpoint host. Forced to 127.0.0.1. */
  host?: string;
  port?: number;
  /**
   * Opt-in only: sets OTEL_LOG_TOOL_DETAILS=1 so custom agent names appear.
   * Also exposes tool commands/input — off by default (§7).
   */
  withToolDetails?: boolean;
}

export interface OtelEnvResult {
  vars: Record<string, string>;
  /** Lines suitable for `eval "$(cc-codeconductor telemetry otel-env)"` */
  exportLines: string[];
  /** Human-readable notes (no secrets). */
  notes: string[];
  endpoint: string;
}

export function buildOtelEnv(options: OtelEnvOptions = {}): OtelEnvResult {
  const host = '127.0.0.1';
  const port = options.port ?? 4318;
  const endpoint = `http://${host}:${port}`;

  const vars: Record<string, string> = {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
  };

  if (options.withToolDetails) {
    vars.OTEL_LOG_TOOL_DETAILS = '1';
  }

  // Explicitly unset forbidden content logs in the printed script so a parent
  // shell that exported them does not leak prompts into the local receiver.
  const exportLines = [
    ...Object.entries(vars).map(([k, v]) => `export ${k}=${shellQuote(v)}`),
    ...FORBIDDEN_OTEL_LOG_VARS.map((k) => `unset ${k}`),
  ];

  const notes = [
    `OTLP endpoint is loopback-only: ${endpoint}`,
    'Do not put OTEL_* in .claude/settings.json (Claude Code ignores them there).',
    'Start the local receiver in another process (Bun.serve on 127.0.0.1) before enabling.',
    'Forbidden (never set): ' + FORBIDDEN_OTEL_LOG_VARS.join(', '),
    options.withToolDetails
      ? 'OTEL_LOG_TOOL_DETAILS=1 enabled by explicit opt-in (exposes agent names and tool input).'
      : 'OTEL_LOG_TOOL_DETAILS left unset (agent names may appear as "custom").',
  ];

  return { vars, exportLines, notes, endpoint };
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
