/**
 * Fail-closed OpenRouter request proxy — edge cases for the 100-request hard cap.
 * Offline only: no real OpenRouter traffic.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, chmod, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN,
  DEFAULT_OPENROUTER_REQUEST_CAP,
  PROXY_LOCAL_TOKEN_PREFIX,
  SlidingWindowRateLimiter,
  buildClaudeChildEnv,
  isProxyLocalToken,
  mintProxyLocalToken,
  parseRequestCounter,
  readRequestCounter,
  reserveRequestSlot,
  rewriteOpenRouterUpstreamPath,
  startOpenRouterRequestProxy,
  writeRequestCounter,
  RequestBudgetExhaustedError,
  RequestCounterError,
  RequestRateLimitError,
  type ProxyHopRecord,
} from '../../src/core/evaluation/bench/openrouter-request-proxy';
import { buildClaudeEnv } from '../../src/core/evaluation/bench/host-claude';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function tmpDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'cc-or-proxy-'));
  dirs.push(d);
  return d;
}

const UPSTREAM_KEY = 'sk-or-v1-test-upstream-key-never-local';

function localToken(): string {
  return mintProxyLocalToken();
}

describe('request counter file', () => {
  test('default cap is 100 and rate limit is 20/min', () => {
    expect(DEFAULT_OPENROUTER_REQUEST_CAP).toBe(100);
    expect(DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN).toBe(20);
  });

  test('SlidingWindowRateLimiter rejects the 21st request in 60s', () => {
    const lim = new SlidingWindowRateLimiter(20);
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) {
      expect(lim.reserve(t0 + i)).toBe(i + 1);
    }
    expect(() => lim.reserve(t0 + 20)).toThrow(RequestRateLimitError);
    // Past the window relative to the newest stamp (t0+19) → empty again.
    expect(lim.reserve(t0 + 19 + 60_001)).toBe(1);
  });

  test('parseRequestCounter rejects corrupt JSON / schema / types', () => {
    expect(() => parseRequestCounter('{')).toThrow(RequestCounterError);
    expect(() => parseRequestCounter('{"schema":"nope","count":0,"max":1,"updatedAt":"x"}')).toThrow(
      /schema mismatch/,
    );
    expect(() =>
      parseRequestCounter(
        JSON.stringify({
          schema: 'openrouter-request-counter/v1',
          count: 1.5,
          max: 10,
          updatedAt: 't',
        }),
      ),
    ).toThrow(/non-negative integers/);
  });

  test('reserveRequestSlot increments and exhausts at max', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'counter.json');
    await writeRequestCounter(path, {
      schema: 'openrouter-request-counter/v1',
      count: 0,
      max: 2,
      updatedAt: 't0',
    });
    expect(await reserveRequestSlot(path, 2)).toBe(1);
    expect(await reserveRequestSlot(path, 2)).toBe(2);
    await expect(reserveRequestSlot(path, 2)).rejects.toBeInstanceOf(
      RequestBudgetExhaustedError,
    );
    const final = await readRequestCounter(path);
    expect(final.count).toBe(2);
  });

  test('corrupt counter fails closed (cannot reserve)', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'counter.json');
    await writeFile(path, '{not-json', 'utf-8');
    await expect(reserveRequestSlot(path, 10)).rejects.toBeInstanceOf(
      RequestCounterError,
    );
  });

  test('unwritable counter fails closed', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'ro', 'counter.json');
    await mkdir(join(dir, 'ro'), { recursive: true });
    await writeRequestCounter(path, {
      schema: 'openrouter-request-counter/v1',
      count: 0,
      max: 5,
      updatedAt: 't0',
    });
    await chmod(join(dir, 'ro'), 0o555);
    try {
      await expect(reserveRequestSlot(path, 5)).rejects.toBeInstanceOf(
        RequestCounterError,
      );
    } finally {
      await chmod(join(dir, 'ro'), 0o755);
    }
  });
});

describe('local proxy token + Claude child env', () => {
  test('mintProxyLocalToken is one-shot local prefix, not an OpenRouter key', () => {
    const t = mintProxyLocalToken();
    expect(isProxyLocalToken(t)).toBe(true);
    expect(t.startsWith(PROXY_LOCAL_TOKEN_PREFIX)).toBe(true);
    expect(t.startsWith('sk-or')).toBe(false);
    expect(mintProxyLocalToken()).not.toBe(t);
  });

  test('buildClaudeChildEnv never includes OPENROUTER_API_KEY', () => {
    const token = mintProxyLocalToken();
    const env = buildClaudeChildEnv({
      modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
      proxyBaseUrl: 'http://127.0.0.1:9999',
      localAuthToken: token,
      parentEnv: {
        ...process.env,
        OPENROUTER_API_KEY: UPSTREAM_KEY,
        ANTHROPIC_AUTH_TOKEN: UPSTREAM_KEY,
        PATH: '/usr/bin',
        HOME: '/tmp',
      },
    });
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(env, 'OPENROUTER_API_KEY')).toBe(
      false,
    );
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe(token);
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:9999');
    expect(env.ANTHROPIC_AUTH_TOKEN).not.toBe(UPSTREAM_KEY);
  });

  test('buildClaudeEnv (host) strips OPENROUTER_API_KEY even offline', () => {
    const prevKey = process.env.OPENROUTER_API_KEY;
    const prevAuth = process.env.ANTHROPIC_AUTH_TOKEN;
    const prevBase = process.env.ANTHROPIC_BASE_URL;
    try {
      process.env.OPENROUTER_API_KEY = UPSTREAM_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;
      delete process.env.ANTHROPIC_BASE_URL;
      const env = buildClaudeEnv('test-model:free');
      expect(env.OPENROUTER_API_KEY).toBeUndefined();
      expect(env.ANTHROPIC_MODEL).toBe('test-model:free');
    } finally {
      if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevKey;
      if (prevAuth === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
      else process.env.ANTHROPIC_AUTH_TOKEN = prevAuth;
      if (prevBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = prevBase;
    }
  });
});

describe('OpenRouter request proxy', () => {
  test('seeds initialCount when counter file is missing', async () => {
    const dir = await tmpDir();
    const token = localToken();
    const proxy = await startOpenRouterRequestProxy({
      counterPath: join(dir, 'seeded.json'),
      maxRequests: 100,
      initialCount: 4,
      upstreamApiKey: UPSTREAM_KEY,
      localAuthToken: token,
    });
    try {
      expect(await proxy.readCount()).toBe(4);
    } finally {
      await proxy.close();
    }
  });

  test('rejects missing/wrong local token with 401', async () => {
    const dir = await tmpDir();
    const token = localToken();
    const proxy = await startOpenRouterRequestProxy({
      counterPath: join(dir, 'c.json'),
      maxRequests: 5,
      upstreamApiKey: UPSTREAM_KEY,
      localAuthToken: token,
    });
    try {
      const noAuth = await fetch(`${proxy.url}/v1/messages`, { method: 'POST' });
      expect(noAuth.status).toBe(401);
      const wrong = await fetch(`${proxy.url}/v1/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${UPSTREAM_KEY}` },
      });
      expect(wrong.status).toBe(401);
      expect(await proxy.readCount()).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  test('rate-limits at 20/min without consuming the durable counter', async () => {
    const dir = await tmpDir();
    let upstreamHits = 0;
    const upstream = createServer((_req, res) => {
      upstreamHits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    const upAddr = upstream.address();
    if (!upAddr || typeof upAddr === 'string') throw new Error('no upstream port');

    const counterPath = join(dir, 'rate.json');
    const token = localToken();
    const proxy = await startOpenRouterRequestProxy({
      counterPath,
      maxRequests: 100,
      maxRequestsPerMinute: 3,
      initialCount: 10,
      upstreamApiKey: UPSTREAM_KEY,
      localAuthToken: token,
      upstreamHost: '127.0.0.1',
      useHttpUpstream: true,
      upstreamPort: upAddr.port,
    });
    try {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${proxy.url}/api/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ model: 'x', messages: [] }),
        });
        expect(res.status).toBe(200);
      }
      const limited = await fetch(`${proxy.url}/api/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model: 'x', messages: [] }),
      });
      expect(limited.status).toBe(429);
      const body = (await limited.json()) as { error?: { type?: string } };
      expect(body.error?.type).toBe('request_rate_limited');
      expect(upstreamHits).toBe(3);
      // Rate-limit reject must not burn another durable slot.
      expect(await proxy.readCount()).toBe(13);
    } finally {
      await proxy.close();
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });

  test('rejects request max+1 with 429 and does not forward', async () => {
    const dir = await tmpDir();
    let upstreamHits = 0;
    const upstream = createServer((_req, res) => {
      upstreamHits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    const upAddr = upstream.address();
    if (!upAddr || typeof upAddr === 'string') throw new Error('no upstream port');

    const counterPath = join(dir, 'c.json');
    const token = localToken();
    await writeRequestCounter(counterPath, {
      schema: 'openrouter-request-counter/v1',
      count: 2,
      max: 2,
      updatedAt: 't',
    });
    const proxy = await startOpenRouterRequestProxy({
      counterPath,
      maxRequests: 2,
      upstreamApiKey: UPSTREAM_KEY,
      localAuthToken: token,
      upstreamHost: '127.0.0.1',
      useHttpUpstream: true,
      upstreamPort: upAddr.port,
    });
    try {
      const res = await fetch(`${proxy.url}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model: 'x:free', messages: [] }),
      });
      expect(res.status).toBe(429);
      const body = (await res.json()) as { error?: { type?: string } };
      expect(body.error?.type).toBe('request_budget_exhausted');
      expect(upstreamHits).toBe(0);
      expect(await proxy.readCount()).toBe(2);
    } finally {
      await proxy.close();
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });

  test('forwards with upstream key only — never the local token', async () => {
    const dir = await tmpDir();
    const seenAuth: string[] = [];
    const upstream = createServer((req: IncomingMessage, res) => {
      seenAuth.push(String(req.headers.authorization ?? ''));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    const upAddr = upstream.address();
    if (!upAddr || typeof upAddr === 'string') throw new Error('no upstream port');

    const token = localToken();
    const proxy = await startOpenRouterRequestProxy({
      counterPath: join(dir, 'c.json'),
      maxRequests: 10,
      upstreamApiKey: UPSTREAM_KEY,
      localAuthToken: token,
      upstreamHost: '127.0.0.1',
      useHttpUpstream: true,
      upstreamPort: upAddr.port,
    });
    try {
      const res = await fetch(`${proxy.url}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-api-key': token,
        },
        body: JSON.stringify({ model: 'x:free', messages: [] }),
      });
      expect(res.status).toBe(200);
      expect(seenAuth).toHaveLength(1);
      expect(seenAuth[0]).toBe(`Bearer ${UPSTREAM_KEY}`);
      expect(seenAuth[0]).not.toContain(token);
      expect(seenAuth[0]).not.toContain(PROXY_LOCAL_TOKEN_PREFIX);
      expect(await proxy.readCount()).toBe(1);
    } finally {
      await proxy.close();
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });

  test('proxy refuses to start when counter file is corrupt', async () => {
    const dir = await tmpDir();
    const counterPath = join(dir, 'bad.json');
    await writeFile(counterPath, '{"schema":"wrong"}', 'utf-8');
    await expect(
      startOpenRouterRequestProxy({
        counterPath,
        maxRequests: 100,
        upstreamApiKey: UPSTREAM_KEY,
        localAuthToken: localToken(),
      }),
    ).rejects.toBeInstanceOf(RequestCounterError);
  });

  test('proxy refuses real OpenRouter key as localAuthToken', async () => {
    const dir = await tmpDir();
    await expect(
      startOpenRouterRequestProxy({
        counterPath: join(dir, 'c.json'),
        maxRequests: 10,
        upstreamApiKey: UPSTREAM_KEY,
        localAuthToken: UPSTREAM_KEY,
      }),
    ).rejects.toBeInstanceOf(RequestCounterError);
  });

  test('proxy down: closed server yields connection error (caller must abort)', async () => {
    const dir = await tmpDir();
    const token = localToken();
    const proxy = await startOpenRouterRequestProxy({
      counterPath: join(dir, 'c.json'),
      maxRequests: 10,
      upstreamApiKey: UPSTREAM_KEY,
      localAuthToken: token,
    });
    const url = proxy.url;
    await proxy.close();
    await expect(fetch(`${url}/v1/messages`)).rejects.toThrow();
  });

  test('counts each hop including repeated small-fast style POSTs', async () => {
    const dir = await tmpDir();
    const path = join(dir, 'c.json');
    await writeRequestCounter(path, {
      schema: 'openrouter-request-counter/v1',
      count: 0,
      max: 5,
      updatedAt: 't',
    });
    for (let i = 1; i <= 5; i++) {
      expect(await reserveRequestSlot(path, 5)).toBe(i);
    }
    await expect(reserveRequestSlot(path, 5)).rejects.toMatchObject({
      name: 'RequestBudgetExhaustedError',
      count: 5,
      max: 5,
    });
  });
});

describe('OpenRouter path rewrite (Claude /api + /v1/messages)', () => {
  test('rewrites bare /v1/messages to /api/v1/messages', () => {
    expect(rewriteOpenRouterUpstreamPath('/v1/messages')).toBe('/api/v1/messages');
    expect(rewriteOpenRouterUpstreamPath('/v1/messages?beta=true')).toBe(
      '/api/v1/messages?beta=true',
    );
    expect(rewriteOpenRouterUpstreamPath('/api/v1/messages')).toBe('/api/v1/messages');
    expect(rewriteOpenRouterUpstreamPath('/api/v1/chat/completions')).toBe(
      '/api/v1/chat/completions',
    );
  });
});

describe('smoke conversation vs fake upstream (SSE + Anthropic headers)', () => {
  test(
    'forwards /api/v1/messages with real key, anthropic headers, body; streams SSE; never leaks local token',
    async () => {
      const dir = await tmpDir();
      const token = localToken();
      const seen: Array<{
        method?: string;
        url?: string;
        authorization?: string;
        anthropicVersion?: string;
        anthropicBeta?: string;
        body: string;
        xApiKey?: string;
      }> = [];
      const chunkArrivalGaps: number[] = [];

      // Fake OpenRouter: Anthropic Messages SSE like a successful smoke hop.
      const upstream = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          seen.push({
            method: req.method,
            url: req.url,
            authorization: String(req.headers.authorization ?? ''),
            anthropicVersion: String(req.headers['anthropic-version'] ?? ''),
            anthropicBeta: String(req.headers['anthropic-beta'] ?? ''),
            xApiKey: String(req.headers['x-api-key'] ?? ''),
            body,
          });
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
          });
          const events = [
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_smoke","type":"message","role":"assistant","model":"nvidia/nemotron-3-super-120b-a12b:free"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hola"}}\n\n',
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
            'event: message_stop\ndata: {"type":"message_stop"}\n\n',
          ];
          let i = 0;
          const tick = () => {
            if (i >= events.length) {
              res.end();
              return;
            }
            res.write(events[i]!);
            i += 1;
            setTimeout(tick, 15);
          };
          tick();
        });
      });
      await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
      const upAddr = upstream.address();
      if (!upAddr || typeof upAddr === 'string') throw new Error('no upstream port');

      const hops: ProxyHopRecord[] = [];
      const proxy = await startOpenRouterRequestProxy({
        counterPath: join(dir, 'c.json'),
        maxRequests: 100,
        initialCount: 0,
        upstreamApiKey: UPSTREAM_KEY,
        localAuthToken: token,
        upstreamHost: '127.0.0.1',
        useHttpUpstream: true,
        upstreamPort: upAddr.port,
        onHop: (h) => hops.push(h),
      });

      try {
        expect(proxy.anthropicBaseUrl).toBe(`${proxy.url}/api`);

        // Replicate Claude Code smoke: BASE_URL=…/api + POST /v1/messages
        // (full URL = anthropicBaseUrl + /v1/messages = …/api/v1/messages).
        const smokeBody = {
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          max_tokens: 64,
          stream: true,
          messages: [{ role: 'user', content: 'di hola' }],
        };
        const res = await fetch(`${proxy.anthropicBaseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${token}`,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'interleaved-thinking-2025-05-14',
            'x-api-key': token, // must be stripped, never forwarded
          },
          body: JSON.stringify(smokeBody),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toMatch(/text\/event-stream/i);

        // Read as a stream to prove we are not buffering the whole SSE body.
        const reader = res.body?.getReader();
        expect(reader).toBeDefined();
        const decoder = new TextDecoder();
        let text = '';
        let lastAt = Date.now();
        for (;;) {
          const { done, value } = await reader!.read();
          if (done) break;
          const now = Date.now();
          chunkArrivalGaps.push(now - lastAt);
          lastAt = now;
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();

        expect(text).toContain('event: message_start');
        expect(text).toContain('hola');
        expect(text).toContain('event: message_stop');
        // Local token must never appear in the streamed body.
        expect(text).not.toContain(token);
        expect(text).not.toContain(PROXY_LOCAL_TOKEN_PREFIX);
        // More than one read chunk ⇒ proxy did not coalesce the whole SSE.
        expect(chunkArrivalGaps.length).toBeGreaterThan(1);

        expect(seen).toHaveLength(1);
        expect(seen[0]!.method).toBe('POST');
        expect(seen[0]!.url).toBe('/api/v1/messages');
        expect(seen[0]!.authorization).toBe(`Bearer ${UPSTREAM_KEY}`);
        expect(seen[0]!.authorization).not.toContain(token);
        expect(seen[0]!.xApiKey).toBe('');
        expect(seen[0]!.anthropicVersion).toBe('2023-06-01');
        expect(seen[0]!.anthropicBeta).toBe('interleaved-thinking-2025-05-14');
        expect(JSON.parse(seen[0]!.body)).toEqual(smokeBody);

        // Safety-net rewrite: bare /v1/messages (wrong BASE_URL) still reaches /api/v1.
        const bare = await fetch(`${proxy.url}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${token}`,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(smokeBody),
        });
        expect(bare.status).toBe(200);
        await bare.text();
        expect(seen[1]!.url).toBe('/api/v1/messages');

        expect(hops.map((h) => h.upstreamPath)).toEqual([
          '/api/v1/messages',
          '/api/v1/messages',
        ]);
        expect(hops.every((h) => h.upstreamStatus === 200)).toBe(true);
        expect(hops.every((h) => h.streamed)).toBe(true);
      } finally {
        await proxy.close();
        await new Promise<void>((r) => upstream.close(() => r()));
      }
    },
    20_000,
  );
});

describe('OpenRouter public catalog check (no key)', () => {
  test('openRouterFreeModelStillListed reports missing vs present', async () => {
    const { openRouterFreeModelStillListed } = await import(
      '../../src/core/evaluation/bench/openrouter-free-model'
    );
    const missing = await openRouterFreeModelStillListed('no-such-model:free', {
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [{ id: 'other:free' }] }), {
          status: 200,
        }),
    });
    expect(missing.listed).toBe(false);

    const present = await openRouterFreeModelStillListed(
      'nvidia/nemotron-3-super-120b-a12b:free',
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              data: [{ id: 'nvidia/nemotron-3-super-120b-a12b:free' }],
            }),
            { status: 200 },
          ),
      },
    );
    expect(present.listed).toBe(true);
    expect(present.freeListed).toBe(true);
  });
});

describe('treatment harness install (offline)', () => {
  test('suite still ships multiply + review oracles', async () => {
    const { loadHarnessSuite } = await import(
      '../../src/core/evaluation/harness-experiment'
    );
    const { resolve } = await import('node:path');
    const repo = resolve(import.meta.dir, '../..');
    const suite = await loadHarnessSuite(
      repo,
      'harness-v1',
      resolve(repo, 'eval/suites/harness-v1/suite.yml'),
    );
    expect(suite.success).toBe(true);
    if (!suite.success) return;
    const ids = suite.data.tasks.map((t) => t.id);
    expect(ids).toContain('feature-multiply');
    expect(ids).toContain('review-seeded-bug');
    const multiply = suite.data.tasks.find((t) => t.id === 'feature-multiply')!;
    const review = suite.data.tasks.find((t) => t.id === 'review-seeded-bug')!;
    expect(multiply.testCommand).toContain('multiply.test.ts');
    expect(review.testCommand).toContain('review-report.test.ts');
  });
});
