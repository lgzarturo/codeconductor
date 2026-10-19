/**
 * Emit harness-telemetry events from Claude Code hooks, the compile-fix loop,
 * and verification gates. No prompts/responses/tool output are stored (§7).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PACKAGE_ROOT } from '../presets/package-paths';
import {
  createBaseEvent,
  type HarnessTelemetryEvent,
  type PrivacyMode,
} from './schema';
import { appendTelemetryEvent, resolveReportSettings } from './store';

export interface ClaudeHookEnvelope {
  session_id?: string;
  sessionId?: string;
  hook_event_name?: string;
  agent_id?: string;
  agent_type?: string;
  agent_transcript_path?: string;
  transcript_path?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  /** Present on PostToolUseFailure — never store its content. */
  error?: unknown;
  /** Never stored (privacy §7). */
  last_assistant_message?: unknown;
}

export function parseClaudeHookEnvelope(raw: string): ClaudeHookEnvelope {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as ClaudeHookEnvelope;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function runIdFromSession(sessionId: string | null | undefined): string {
  if (sessionId && sessionId.trim().length > 0) return `r-${sessionId.trim()}`;
  return `r-${Date.now().toString(36)}`;
}

export function formatRetryReason(reason: string, privacy: PrivacyMode): string {
  if (privacy === 'strict') {
    return `sha256:${createHash('sha256').update(reason).digest('hex').slice(0, 16)}`;
  }
  return reason.length > 120 ? reason.slice(0, 120) : reason;
}

async function harnessMeta(): Promise<{ version: string | null; commit: string | null }> {
  try {
    const pkg = JSON.parse(await readFile(resolve(PACKAGE_ROOT, 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return { version: typeof pkg.version === 'string' ? pkg.version : null, commit: null };
  } catch {
    return { version: null, commit: null };
  }
}

async function emit(
  projectRoot: string,
  event: HarnessTelemetryEvent,
): Promise<void> {
  await appendTelemetryEvent(projectRoot, event);
}

/** SubagentStop → agent.end (role = agent_type). */
export async function emitAgentEndFromSubagentStop(
  projectRoot: string,
  envelope: ClaudeHookEnvelope,
): Promise<HarnessTelemetryEvent> {
  const settings = await resolveReportSettings(projectRoot);
  const meta = await harnessMeta();
  const sessionId = envelope.session_id ?? envelope.sessionId ?? null;
  const event = createBaseEvent({
    runId: runIdFromSession(sessionId),
    event: 'agent.end',
    harnessVersion: meta.version,
    privacy: settings.privacy,
  });
  event.host = { name: 'claude-code', version: null, mode: null };
  event.agent = {
    role: typeof envelope.agent_type === 'string' ? envelope.agent_type : null,
    agentId: typeof envelope.agent_id === 'string' ? envelope.agent_id : null,
  };
  // Transcript path is noted only for deferred M3 reading — not stored in the
  // event schema. standard vs strict only affects agentId/model scrubbing in store.
  event.source = { usage: 'harness', reliability: 'high' };
  // Drop last_assistant_message intentionally (privacy).
  await emit(projectRoot, event);
  return event;
}

/** SessionEnd → run.end (transcript read deferred to M3). */
export async function emitRunEndFromSessionEnd(
  projectRoot: string,
  envelope: ClaudeHookEnvelope,
): Promise<HarnessTelemetryEvent> {
  const settings = await resolveReportSettings(projectRoot);
  const meta = await harnessMeta();
  const sessionId = envelope.session_id ?? envelope.sessionId ?? null;
  const event = createBaseEvent({
    runId: runIdFromSession(sessionId),
    event: 'run.end',
    harnessVersion: meta.version,
    privacy: settings.privacy,
  });
  event.host = { name: 'claude-code', version: null, mode: null };
  event.source = { usage: 'harness', reliability: 'medium' };
  event.outcome = { status: null, firstTry: null };
  await emit(projectRoot, event);
  return event;
}

/**
 * Stop — session/turn boundary. Does not store last_assistant_message.
 * Emits nothing beyond acknowledging the hook (keeps Stop async and cheap).
 * Subagent agent.end comes from SubagentStop; run.end from SessionEnd.
 */
export async function handleStopHook(
  _projectRoot: string,
  _envelope: ClaudeHookEnvelope,
): Promise<void> {
  // Intentionally empty: Stop must stay under the p95 budget and must not
  // persist assistant text. Registration with async:true is the M2 deliverable.
}

/** post-tool: optional verification heuristic when the tool looks like a test run. */
export async function emitPostToolTelemetry(
  projectRoot: string,
  envelope: ClaudeHookEnvelope,
  options: { failed?: boolean } = {},
): Promise<HarnessTelemetryEvent | null> {
  const command =
    typeof envelope.tool_input?.command === 'string'
      ? envelope.tool_input.command
      : typeof envelope.tool_input?.cmd === 'string'
        ? envelope.tool_input.cmd
        : '';
  const looksLikeTest =
    /\b(?:bun|npm|pnpm|yarn)\s+test\b/i.test(command) ||
    /\b--test\b/.test(command) ||
    /\bpytest\b/i.test(command) ||
    /\bgo\s+test\b/i.test(command);

  if (!looksLikeTest) return null;

  const settings = await resolveReportSettings(projectRoot);
  const meta = await harnessMeta();
  const sessionId = envelope.session_id ?? envelope.sessionId ?? null;
  const event = createBaseEvent({
    runId: runIdFromSession(sessionId),
    event: 'verification',
    harnessVersion: meta.version,
    privacy: settings.privacy,
  });
  event.host = { name: 'claude-code', version: null, mode: null };
  event.agent = {
    role: typeof envelope.agent_type === 'string' ? envelope.agent_type : 'main',
    agentId: typeof envelope.agent_id === 'string' ? envelope.agent_id : null,
  };
  event.verification = {
    gate: 'tests',
    passed: options.failed === true ? false : true,
    durationMs: null,
  };
  event.source = { usage: 'harness', reliability: 'medium' };
  await emit(projectRoot, event);
  return event;
}

export async function emitLoopIteration(
  projectRoot: string,
  input: {
    runId: string;
    taskId?: string | null;
    iteration: number;
    maxIterations: number;
  },
): Promise<void> {
  const settings = await resolveReportSettings(projectRoot);
  const meta = await harnessMeta();
  const event = createBaseEvent({
    runId: input.runId,
    event: 'iteration',
    harnessVersion: meta.version,
    privacy: settings.privacy,
  });
  event.taskId = input.taskId ?? null;
  event.loop = {
    iteration: input.iteration,
    retryReason: null,
    maxIterations: input.maxIterations,
  };
  event.source = { usage: 'harness', reliability: 'high' };
  await emit(projectRoot, event);
}

export async function emitLoopRetry(
  projectRoot: string,
  input: {
    runId: string;
    taskId?: string | null;
    iteration: number;
    maxIterations: number;
    feedback: string;
  },
): Promise<void> {
  const settings = await resolveReportSettings(projectRoot);
  const meta = await harnessMeta();
  const event = createBaseEvent({
    runId: input.runId,
    event: 'retry',
    harnessVersion: meta.version,
    privacy: settings.privacy,
  });
  event.taskId = input.taskId ?? null;
  event.loop = {
    iteration: input.iteration,
    retryReason: formatRetryReason(input.feedback, settings.privacy),
    maxIterations: input.maxIterations,
  };
  event.source = { usage: 'harness', reliability: 'high' };
  await emit(projectRoot, event);
}

export async function emitVerificationGate(
  projectRoot: string,
  input: {
    runId: string;
    taskId: string;
    gate: string;
    passed: boolean;
    durationMs?: number | null;
  },
): Promise<void> {
  const settings = await resolveReportSettings(projectRoot);
  const meta = await harnessMeta();
  const event = createBaseEvent({
    runId: input.runId,
    event: 'verification',
    harnessVersion: meta.version,
    privacy: settings.privacy,
  });
  event.taskId = input.taskId;
  event.verification = {
    gate: input.gate,
    passed: input.passed,
    durationMs: input.durationMs ?? null,
  };
  event.source = { usage: 'harness', reliability: 'high' };
  await emit(projectRoot, event);
}
