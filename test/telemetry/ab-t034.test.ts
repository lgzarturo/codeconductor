/**
 * T-034: fail-closed request cap + dry-run harness load asymmetry.
 * Offline only — no live OpenRouter / Claude spend.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  inspectHarnessPresence,
  isClaudeWorkspaceTrusted,
  prepareIsolatedClaudeConfig,
  sanitizeStderr,
} from '../../src/core/evaluation/bench/host-claude';
import {
  mintProxyLocalToken,
  readRequestCounter,
  startOpenRouterRequestProxy,
  writeRequestCounter,
} from '../../src/core/evaluation/bench/openrouter-request-proxy';
import {
  AB_REQUEST_CAP,
  defaultAbCounterPath,
} from '../../src/core/evaluation/ab/constants';
import { runAbDryRun, disposeWorkRoot } from '../../src/core/evaluation/ab/prepare';
import {
  buildAbReport,
  decideAbVerdict,
  resolveAbCost,
  writeAbReport,
  type AbRunCell,
} from '../../src/core/evaluation/ab/report';
import {
  interleaveAbSchedule,
  resetAbCounter,
  runAb,
} from '../../src/core/evaluation/ab/run';

const REPO = resolve(import.meta.dir, '../..');
const FIXTURE = resolve(REPO, 'eval/suites/harness-v1/fixture');
const dirs: string[] = [];

afterEach(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'cc-ab-t034-'));
  dirs.push(d);
  return d;
}

function cell(partial: Partial<AbRunCell> & Pick<AbRunCell, 'arm' | 'repetition'>): AbRunCell {
  return {
    taskId: 't',
    success: true,
    finished: true,
    tokensIn: 10,
    tokensOut: 5,
    requests: 1,
    iterations: 1,
    retries: 0,
    durationMs: 1,
    costUsd: null,
    error: null,
    ...partial,
  };
}

describe('T-034 trust gate (root cause of Invalid treatment)', () => {
  test('isolated config trusts the workdir; another config does not', async () => {
    const cwd = await tmp();
    const configDir = await prepareIsolatedClaudeConfig(cwd);
    dirs.push(configDir);
    expect(await isClaudeWorkspaceTrusted(cwd, configDir)).toBe(true);
    expect(await isClaudeWorkspaceTrusted(cwd, await tmp())).toBe(false);
  });
});

describe('T-034 dry-run: harness loaded vs not', () => {
  test('con-arnes loads preset; sin-arnes does not', async () => {
    const dry = await runAbDryRun(FIXTURE);
    dirs.push(dry.workRoot);
    console.log(dry.messages.join('\n'));
    expect(dry.ok).toBe(true);
    const sin = dry.arms.find((a) => a.arm === 'sin-arnes')!;
    const con = dry.arms.find((a) => a.arm === 'con-arnes')!;
    expect(sin.presence.loaded).toBe(false);
    expect(sin.presence.files.length).toBe(0);
    expect(con.presence.loaded).toBe(true);
    expect(con.presence.files).toContain('.claude/CLAUDE.md');
    expect(con.presence.files).toContain('.claude/settings.json');
    expect(con.presence.fingerprint).toBeTruthy();
    expect(con.presence.workspaceTrusted).toBe(true);
  }, 120_000);

  test('runAb --dry-run writes report outside repo and exits 0', async () => {
    const out = await tmp();
    const result = await runAb({
      provider: 'free',
      dryRun: true,
      out,
      projectRoot: REPO,
    });
    console.log(result.dryRunMessages.join('\n'));
    expect(result.code).toBe(0);
    expect(result.error).toBeNull();
    expect(result.reportPaths?.jsonPath.startsWith(out)).toBe(true);
    const md = await readFile(result.reportPaths!.mdPath, 'utf-8');
    expect(md).toContain('DRY-RUN OK');
  }, 120_000);
});

describe('T-034 fail-closed request tope', () => {
  test('proxy rejects POST after max; report marks tope alcanzado; exit != 0', async () => {
    const dir = await tmp();
    const counterPath = join(dir, 'counter.json');
    let forwarded = 0;
    const upstream = createServer((_req: IncomingMessage, res: ServerResponse) => {
      forwarded += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: `upstream-${forwarded}` }));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    const addr = upstream.address();
    if (!addr || typeof addr === 'string') throw new Error('no upstream port');
    const local = mintProxyLocalToken();
    const proxy = await startOpenRouterRequestProxy({
      counterPath,
      maxRequests: 2,
      maxRequestsPerMinute: 100,
      upstreamApiKey: 'sk-or-v1-test-never-real',
      localAuthToken: local,
      useHttpUpstream: true,
      upstreamHost: '127.0.0.1',
      upstreamPort: addr.port,
    });

    const post = async (p: { anthropicBaseUrl: string; token: string }) => {
      const res = await fetch(`${p.anthropicBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${p.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'x', messages: [] }),
      });
      return { status: res.status, body: await res.text() };
    };

    expect((await post({ anthropicBaseUrl: proxy.anthropicBaseUrl, token: local })).status).toBe(
      200,
    );
    expect((await post({ anthropicBaseUrl: proxy.anthropicBaseUrl, token: local })).status).toBe(
      200,
    );
    const third = await post({ anthropicBaseUrl: proxy.anthropicBaseUrl, token: local });
    expect(third.status).toBe(403);
    expect(forwarded).toBe(2);
    await proxy.close();
    upstream.close();

    const report = buildAbReport({
      provider: 'free',
      modelId: 'test',
      maxTurns: 6,
      requestCap: 2,
      requestCount: 2,
      capReached: true,
      usageDeltaUsd: null,
      cells: [cell({ arm: 'sin-arnes', repetition: 1, success: null, finished: false, costUsd: null })],
      notes: ['tope alcanzado'],
    });
    expect(report.capReached).toBe(true);
    const exitCode = report.capReached ? 2 : 0;
    expect(exitCode).not.toBe(0);
    console.log(JSON.stringify({ forwarded, thirdStatus: third.status, exitCode }));
  });

  test('two proxy sessions share durable counter and fail closed at tope', async () => {
    const dir = await tmp();
    const counterPath = join(dir, 'counter-free.json');
    expect(defaultAbCounterPath('free', dir)).toBe(counterPath);

    let forwarded = 0;
    const upstream = createServer((_req: IncomingMessage, res: ServerResponse) => {
      forwarded += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    const addr = upstream.address();
    if (!addr || typeof addr === 'string') throw new Error('no upstream port');

    const runSession = async (max: number) => {
      const local = mintProxyLocalToken();
      const proxy = await startOpenRouterRequestProxy({
        counterPath,
        maxRequests: max,
        maxRequestsPerMinute: 100,
        upstreamApiKey: 'sk-or-v1-test-never-real',
        localAuthToken: local,
        useHttpUpstream: true,
        upstreamHost: '127.0.0.1',
        upstreamPort: addr.port,
      });
      const post = async () => {
        const res = await fetch(`${proxy.anthropicBaseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${local}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model: 'x', messages: [] }),
        });
        return res.status;
      };
      return { proxy, post };
    };

    // Session 1: burn 2 of 3.
    const s1 = await runSession(3);
    expect(await s1.post()).toBe(200);
    expect(await s1.post()).toBe(200);
    expect(await s1.proxy.readCount()).toBe(2);
    await s1.proxy.close();

    // Session 2: same path continues — 1 left, then fail-closed.
    const s2 = await runSession(3);
    expect(await s2.proxy.readCount()).toBe(2);
    expect(await s2.post()).toBe(200);
    expect(await s2.proxy.readCount()).toBe(3);
    expect(await s2.post()).toBe(403);
    expect(forwarded).toBe(3);
    await s2.proxy.close();

    // Session 3: already at tope → immediate 403, no extra forward.
    const s3 = await runSession(3);
    expect(await s3.proxy.readCount()).toBe(3);
    expect(await s3.post()).toBe(403);
    expect(forwarded).toBe(3);
    await s3.proxy.close();
    upstream.close();

    // --reset-counter restores cupo.
    await resetAbCounter({
      provider: 'free',
      counterPath,
      maxRequests: 3,
    });
    expect((await readRequestCounter(counterPath)).count).toBe(0);
    console.log(
      JSON.stringify({
        note: 'two executions share cupo; reset-counter → 0',
        forwarded,
        finalCountBeforeReset: 3,
      }),
    );
  });

  test('provider caps match brief (500 free / 300 deepseek)', () => {
    expect(AB_REQUEST_CAP.free).toBe(500);
    expect(AB_REQUEST_CAP.deepseek).toBe(300);
  });

  test('runAb with counter already at cap exits tope without live host', async () => {
    const out = await tmp();
    const counterPath = join(out, 'counter-free.json');
    await writeRequestCounter(counterPath, {
      schema: 'openrouter-request-counter/v1',
      count: 500,
      max: 500,
      updatedAt: new Date().toISOString(),
    });
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-never-real-for-cap-gate';
    try {
      const result = await runAb({
        provider: 'free',
        out,
        counterPath,
        projectRoot: REPO,
        live: true,
      });
      expect(result.code).toBe(2);
      expect(result.error).toBe('tope alcanzado');
      expect(result.report?.capReached).toBe(true);
      expect(result.report?.requestCount).toBe(500);
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });
});

describe('T-034 schedule interleaving', () => {
  test('pairs include both sin→con and con→sin orderings', () => {
    const schedule = interleaveAbSchedule(['a', 'b', 'c', 'd', 'e'], 5, 42);
    expect(schedule).toHaveLength(50);
    let sinFirst = 0;
    let conFirst = 0;
    for (let i = 0; i < schedule.length; i += 2) {
      const left = schedule[i]!;
      const right = schedule[i + 1]!;
      expect(left.taskId).toBe(right.taskId);
      expect(left.repetition).toBe(right.repetition);
      expect(new Set([left.arm, right.arm])).toEqual(new Set(['sin-arnes', 'con-arnes']));
      if (left.arm === 'sin-arnes') sinFirst += 1;
      else conFirst += 1;
    }
    expect(sinFirst).toBeGreaterThan(0);
    expect(conFirst).toBeGreaterThan(0);
    // Deterministic for a fixed seed.
    expect(interleaveAbSchedule(['a'], 2, 7).map((s) => s.arm).join(',')).toBe(
      interleaveAbSchedule(['a'], 2, 7).map((s) => s.arm).join(','),
    );
  });
});

describe('T-034 sanitizeStderr secrets', () => {
  test('redacts DEEPSEEK_API_KEY, OPENROUTER_API_KEY, and sk-* tokens', () => {
    const raw =
      'OPENROUTER_API_KEY=sk-or-v1-abcdefghijklmnopqrstuvwxyz012345 ' +
      'DEEPSEEK_API_KEY=sk-deepseek-secretvalue999 ' +
      'leak sk-abcdefghijklmnopqrstuvwxyz leak2 sk-ant-api03-abcdefghijklmnop ' +
      'Bearer sk-or-v1-zzzzzzzzzzzzzzzzzzzz';
    const s = sanitizeStderr(raw, 800);
    expect(s).toContain('OPENROUTER_API_KEY=[REDACTED]');
    expect(s).toContain('DEEPSEEK_API_KEY=[REDACTED]');
    expect(s).not.toContain('sk-or-v1-abcdefghijklmnopqrstuvwxyz012345');
    expect(s).not.toContain('sk-deepseek-secretvalue999');
    expect(s).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(s).toContain('[REDACTED');
  });
});

describe('T-034 cost labeling', () => {
  test('usage Δ → real; host costUsd → estimado; else desconocido', () => {
    expect(resolveAbCost({ usageDeltaUsd: 0.012, cells: [] }).label).toBe('real');
    expect(
      resolveAbCost({
        usageDeltaUsd: null,
        cells: [cell({ arm: 'sin-arnes', repetition: 1, costUsd: 0.05 })],
      }),
    ).toEqual({ label: 'estimado', usageDeltaUsd: 0.05 });
    expect(resolveAbCost({ usageDeltaUsd: null, cells: [] }).label).toBe('desconocido');
  });
});

describe('T-034 verdict rule', () => {
  test('low N → no concluyente', () => {
    const cells: AbRunCell[] = [];
    for (let i = 1; i <= 3; i++) {
      cells.push(cell({ arm: 'sin-arnes', repetition: i }));
      cells.push(cell({ arm: 'con-arnes', repetition: i }));
    }
    const report = buildAbReport({
      provider: 'free',
      modelId: 'm',
      maxTurns: 6,
      requestCap: 500,
      requestCount: 6,
      capReached: false,
      usageDeltaUsd: null,
      cells,
    });
    expect(report.verdict).toBe('no concluyente');
    expect(decideAbVerdict(report.arms[0]!, report.arms[1]!).verdict).toBe('no concluyente');
  });
});

describe('T-034 inspectHarnessPresence without install', () => {
  test('empty fixture is not loaded', async () => {
    const cwd = await tmp();
    await writeFile(join(cwd, 'noop.txt'), 'x');
    const p = await inspectHarnessPresence(cwd, await tmp());
    expect(p.loaded).toBe(false);
    expect(p.missing.length).toBe(3);
  });
});

afterEach(async () => {
  await disposeWorkRoot('/tmp/does-not-exist-ab').catch(() => undefined);
});
