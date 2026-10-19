/**
 * Pure aggregation over harness-telemetry/v1 events.
 * Same logic must be mirrored in microsdd metrics.py.
 */
import type { HarnessTelemetryEvent, TelemetryUsage } from './schema';

export interface SpecialistAggregate {
  taskId: string;
  role: string;
  usage: TelemetryUsage;
  costUsd: number | null;
  events: number;
  modelCalls: number;
  agentEnds: number;
}

export interface TaskAggregate {
  taskId: string;
  usage: TelemetryUsage;
  costUsd: number | null;
  iterations: number | null;
  retries: number;
  verifications: Record<string, { passed: number; failed: number }>;
  specialists: SpecialistAggregate[];
  taskEnd: HarnessTelemetryEvent | null;
}

export interface RunAggregate {
  runId: string;
  usage: TelemetryUsage;
  costUsd: number | null;
  durationMs: number | null;
  tasks: TaskAggregate[];
  runEnd: HarnessTelemetryEvent | null;
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function mergeUsage(a: TelemetryUsage, b: TelemetryUsage | null | undefined): TelemetryUsage {
  if (!b) return { ...a };
  return {
    input: sumNullable(a.input, b.input),
    output: sumNullable(a.output, b.output),
    cacheRead: sumNullable(a.cacheRead, b.cacheRead),
    cacheWrite: sumNullable(a.cacheWrite, b.cacheWrite),
    reasoning: sumNullable(a.reasoning, b.reasoning),
    calls: sumNullable(a.calls, b.calls),
    apiRetries: sumNullable(a.apiRetries, b.apiRetries),
  };
}

function emptyUsage(): TelemetryUsage {
  return {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    reasoning: null,
    calls: null,
    apiRetries: null,
  };
}

function addCost(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Sum model.call + agent.end by taskId + role. */
export function aggregateBySpecialist(events: HarnessTelemetryEvent[]): SpecialistAggregate[] {
  const map = new Map<string, SpecialistAggregate>();

  for (const ev of events) {
    if (ev.event !== 'model.call' && ev.event !== 'agent.end') continue;
    const taskId = ev.taskId ?? '_';
    const role = ev.agent?.role ?? 'main';
    const key = `${taskId}::${role}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        taskId,
        role,
        usage: emptyUsage(),
        costUsd: null,
        events: 0,
        modelCalls: 0,
        agentEnds: 0,
      };
      map.set(key, entry);
    }
    entry.events++;
    if (ev.event === 'model.call') entry.modelCalls++;
    if (ev.event === 'agent.end') entry.agentEnds++;
    entry.usage = mergeUsage(entry.usage, ev.usage);
    entry.costUsd = addCost(entry.costUsd, ev.cost?.usd ?? null);
  }

  return [...map.values()].sort((a, b) =>
    a.taskId === b.taskId ? a.role.localeCompare(b.role) : a.taskId.localeCompare(b.taskId),
  );
}

/** task.end plus specialist sums, max iteration, retry count, verification tallies. */
export function aggregateByTask(events: HarnessTelemetryEvent[]): TaskAggregate[] {
  const specialists = aggregateBySpecialist(events);
  const byTask = new Map<string, TaskAggregate>();

  const ensure = (taskId: string): TaskAggregate => {
    let t = byTask.get(taskId);
    if (!t) {
      t = {
        taskId,
        usage: emptyUsage(),
        costUsd: null,
        iterations: null,
        retries: 0,
        verifications: {},
        specialists: [],
        taskEnd: null,
      };
      byTask.set(taskId, t);
    }
    return t;
  };

  for (const ev of events) {
    // run.start / run.end are run-scoped; do not invent a "_" task bucket.
    if (ev.event === 'run.start' || ev.event === 'run.end') continue;

    const taskId = ev.taskId ?? '_';
    const t = ensure(taskId);

    if (ev.event === 'task.end') {
      t.taskEnd = ev;
      t.usage = mergeUsage(t.usage, ev.usage);
      t.costUsd = addCost(t.costUsd, ev.cost?.usd ?? null);
      if (ev.loop?.iteration !== null && ev.loop?.iteration !== undefined) {
        t.iterations =
          t.iterations === null ? ev.loop.iteration : Math.max(t.iterations, ev.loop.iteration);
      }
    }

    if (ev.event === 'iteration' && ev.loop?.iteration !== null && ev.loop?.iteration !== undefined) {
      t.iterations =
        t.iterations === null ? ev.loop.iteration : Math.max(t.iterations, ev.loop.iteration);
    }

    if (ev.event === 'retry') {
      t.retries += 1;
    }

    if (ev.event === 'verification' && ev.verification?.gate) {
      const gate = ev.verification.gate;
      if (!t.verifications[gate]) t.verifications[gate] = { passed: 0, failed: 0 };
      if (ev.verification.passed === true) t.verifications[gate].passed++;
      else if (ev.verification.passed === false) t.verifications[gate].failed++;
    }
  }

  for (const s of specialists) {
    const t = ensure(s.taskId);
    t.specialists.push(s);
    // Prefer task.end totals when present; otherwise fold specialist sums.
    if (!t.taskEnd) {
      t.usage = mergeUsage(t.usage, s.usage);
      t.costUsd = addCost(t.costUsd, s.costUsd);
    }
  }

  return [...byTask.values()].sort((a, b) => a.taskId.localeCompare(b.taskId));
}

/** run.end plus per-task aggregates. */
export function aggregateByRun(events: HarnessTelemetryEvent[]): RunAggregate[] {
  const byRun = new Map<string, HarnessTelemetryEvent[]>();
  for (const ev of events) {
    const list = byRun.get(ev.runId) ?? [];
    list.push(ev);
    byRun.set(ev.runId, list);
  }

  const out: RunAggregate[] = [];
  for (const [runId, runEvents] of byRun) {
    const tasks = aggregateByTask(runEvents);
    const runEnd = [...runEvents].reverse().find((e) => e.event === 'run.end') ?? null;
    let usage = emptyUsage();
    let costUsd: number | null = null;
    if (runEnd?.usage) {
      usage = mergeUsage(usage, runEnd.usage);
      costUsd = runEnd.cost?.usd ?? null;
    } else {
      for (const t of tasks) {
        usage = mergeUsage(usage, t.usage);
        costUsd = addCost(costUsd, t.costUsd);
      }
    }
    out.push({
      runId,
      usage,
      costUsd,
      durationMs: runEnd?.durationMs ?? null,
      tasks,
      runEnd,
    });
  }

  return out.sort((a, b) => a.runId.localeCompare(b.runId));
}

/** Total tokens for efficiency scoring: input + cacheRead + cacheWrite + output. */
export function totalTokens(usage: TelemetryUsage | null | undefined): number | null {
  if (!usage) return null;
  const parts = [usage.input, usage.cacheRead, usage.cacheWrite, usage.output];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
}
