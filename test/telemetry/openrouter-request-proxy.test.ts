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
  DEFAULT_OPENROUTER_REQUEST_CAP,
  PROXY_LOCAL_TOKEN_PREFIX,
  buildClaudeChildEnv,
  isProxyLocalToken,
  mintProxyLocalToken,
  parseRequestCounter,
  readRequestCounter,
  reserveRequestSlot,
  startOpenRouterRequestProxy,
  writeRequestCounter,
  RequestBudgetExhaustedError,
  RequestCounterError,
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
  test('default cap is 100', () => {
    expect(DEFAULT_OPENROUTER_REQUEST_CAP).toBe(100);
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
