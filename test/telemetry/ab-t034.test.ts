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
  trustClaudeWorkspace,
} from '../../src/core/evaluation/bench/host-claude';
import {
  mintProxyLocalToken,
  startOpenRouterRequestProxy,
} from '../../src/core/evaluation/bench/openrouter-request-proxy';
import { AB_REQUEST_CAP } from '../../src/core/evaluation/ab/constants';
import { runAbDryRun, disposeWorkRoot } from '../../src/core/evaluation/ab/prepare';
import {
  buildAbReport,
  decideAbVerdict,
  writeAbReport,
  type AbRunCell,
} from '../../src/core/evaluation/ab/report';
import { runAb } from '../../src/core/evaluation/ab/run';

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

describe('T-034 trust gate (root cause of Invalid treatment)', () => {
  test('trustClaudeWorkspace marks projects[abs].hasTrustDialogAccepted', async () => {
    const cwd = await tmp();
    const abs = await trustClaudeWorkspace(cwd);
    expect(await isClaudeWorkspaceTrusted(cwd)).toBe(true);
    const raw = await readFile(join(process.env.HOME!, '.claude.json'), 'utf-8');
    const json = JSON.parse(raw) as {
      projects: Record<string, { hasTrustDialogAccepted?: boolean }>;
    };
    expect(json.projects[abs]?.hasTrustDialogAccepted).toBe(true);
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
    const upstream = createServer((req: IncomingMessage, res: ServerResponse) => {
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

    const post = async (): Promise<{ status: number; body: string }> => {
      const res = await fetch(`${proxy.anthropicBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${local}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'x', messages: [] }),
      });
      return { status: res.status, body: await res.text() };
    };

    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    const third = await post();
    expect(third.status).toBe(403);
    expect(third.body).toMatch(/budget|exhausted|cc_proxy/i);
    // Fail-closed: no further upstream hop on the rejected request.
    expect(forwarded).toBe(2);
    expect(await proxy.readCount()).toBe(2);

    // Fourth attempt still blocked — counter does not advance, no new forward.
    const fourth = await post();
    expect(fourth.status).toBe(403);
    expect(forwarded).toBe(2);
    expect(await proxy.readCount()).toBe(2);

    await proxy.close();
    upstream.close();

    const cells: AbRunCell[] = [
      {
        taskId: 't',
        arm: 'sin-arnes',
        repetition: 1,
        success: null,
        finished: false,
        tokensIn: null,
        tokensOut: null,
        requests: null,
        iterations: null,
        retries: null,
        durationMs: 1,
        error: 'tope alcanzado',
      },
    ];
    const report = buildAbReport({
      provider: 'free',
      modelId: 'test',
      maxTurns: 6,
      requestCap: 2,
      requestCount: 2,
      capReached: true,
      usageDeltaUsd: null,
      costLabel: 'desconocido',
      cells,
      notes: ['tope alcanzado'],
    });
    expect(report.capReached).toBe(true);
    expect(report.notes).toContain('tope alcanzado');
    const paths = await writeAbReport(dir, report);
    const written = JSON.parse(await readFile(paths.jsonPath, 'utf-8')) as {
      capReached: boolean;
    };
    expect(written.capReached).toBe(true);
    // Simulate CLI exit: tope → non-zero
    const exitCode = report.capReached ? 2 : 0;
    expect(exitCode).not.toBe(0);
    console.log(
      JSON.stringify({
        forwarded,
        proxyCount: 2,
        thirdStatus: third.status,
        exitCode,
        note: 'tope alcanzado',
      }),
    );
  });

  test('provider caps match brief (500 free / 300 deepseek)', () => {
    expect(AB_REQUEST_CAP.free).toBe(500);
    expect(AB_REQUEST_CAP.deepseek).toBe(300);
  });
});

describe('T-034 verdict rule', () => {
  test('low N → no concluyente', () => {
    const cells: AbRunCell[] = [];
    for (let i = 1; i <= 3; i++) {
      cells.push({
        taskId: 't',
        arm: 'sin-arnes',
        repetition: i,
        success: true,
        finished: true,
        tokensIn: 10,
        tokensOut: 5,
        requests: 1,
        iterations: 1,
        retries: 0,
        durationMs: 1,
        error: null,
      });
      cells.push({
        taskId: 't',
        arm: 'con-arnes',
        repetition: i,
        success: true,
        finished: true,
        tokensIn: 10,
        tokensOut: 5,
        requests: 1,
        iterations: 1,
        retries: 0,
        durationMs: 1,
        error: null,
      });
    }
    const report = buildAbReport({
      provider: 'free',
      modelId: 'm',
      maxTurns: 6,
      requestCap: 500,
      requestCount: 6,
      capReached: false,
      usageDeltaUsd: null,
      costLabel: 'desconocido',
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
    const p = await inspectHarnessPresence(cwd);
    expect(p.loaded).toBe(false);
    expect(p.missing.length).toBe(3);
  });
});

afterEach(async () => {
  // dry-run helper may leave roots registered above; dispose is idempotent
  await disposeWorkRoot('/tmp/does-not-exist-ab').catch(() => undefined);
});
