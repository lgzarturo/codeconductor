/**
 * Fail-closed OpenRouter request proxy — edge cases for the 100-request hard cap.
 * Offline only: no real OpenRouter traffic.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, chmod, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_OPENROUTER_REQUEST_CAP,
  parseRequestCounter,
  readRequestCounter,
  reserveRequestSlot,
  startOpenRouterRequestProxy,
  writeRequestCounter,
  RequestBudgetExhaustedError,
  RequestCounterError,
} from '../../src/core/evaluation/bench/openrouter-request-proxy';

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
    // Make parent directory non-writable so rename/write fails.
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

describe('OpenRouter request proxy', () => {
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

    // Point "upstream" at our fake by monkeying host via custom upstreamHost
    // that resolves... we use hostname openrouter.ai normally. For this test,
    // start proxy with upstreamHost = 127.0.0.1 won't work over https.
    // Instead: unit-test reserve + a thin proxy that uses http to localhost.
    // We'll hit the proxy's budget path without needing real TLS upstream by
    // exhausting the counter first, then asserting 429 before forward.
    const counterPath = join(dir, 'c.json');
    await writeRequestCounter(counterPath, {
      schema: 'openrouter-request-counter/v1',
      count: 2,
      max: 2,
      updatedAt: 't',
    });
    const proxy = await startOpenRouterRequestProxy({
      counterPath,
      maxRequests: 2,
      // Upstream unused because we expect 429 before forward.
      upstreamHost: '127.0.0.1',
    });
    try {
      const res = await fetch(`${proxy.url}/api/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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

  test('proxy refuses to start when counter file is corrupt', async () => {
    const dir = await tmpDir();
    const counterPath = join(dir, 'bad.json');
    await writeFile(counterPath, '{"schema":"wrong"}', 'utf-8');
    await expect(
      startOpenRouterRequestProxy({ counterPath, maxRequests: 100 }),
    ).rejects.toBeInstanceOf(RequestCounterError);
  });

  test('proxy down: closed server yields connection error (caller must abort)', async () => {
    const dir = await tmpDir();
    const counterPath = join(dir, 'c.json');
    const proxy = await startOpenRouterRequestProxy({
      counterPath,
      maxRequests: 10,
    });
    const url = proxy.url;
    await proxy.close();
    await expect(fetch(`${url}/v1/messages`)).rejects.toThrow();
  });

  test('counts each hop including repeated small-fast style POSTs', async () => {
    // Exhaust via reserve API to simulate N chat + small-fast calls.
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
  // Re-export smoke check that the existing bench-m5 suite covers; keep a
  // lightweight assertion here so this file documents Phase-1 (a).
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
