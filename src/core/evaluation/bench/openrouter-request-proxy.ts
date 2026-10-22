/**
 * Fail-closed local proxy between Claude Code and OpenRouter.
 *
 * Counts every HTTP request forwarded to openrouter.ai (chat completions,
 * small-fast / haiku aliases, /api/v1/key, /models, …). Persists the count
 * to disk. Request N+1 when max=N is rejected and the run must abort.
 *
 * If the counter file cannot be read or written, the proxy refuses to
 * forward (fail-closed) — never proceeds without a durable count.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export const DEFAULT_OPENROUTER_REQUEST_CAP = 100;
export const OPENROUTER_UPSTREAM_HOST = 'openrouter.ai';

export interface RequestCounterState {
  schema: 'openrouter-request-counter/v1';
  count: number;
  max: number;
  updatedAt: string;
}

export interface OpenRouterRequestProxyOptions {
  /** Absolute path to the durable counter JSON file. */
  counterPath: string;
  /** Hard cap (inclusive). Request max+1 is rejected. Default 100. */
  maxRequests?: number;
  /** Bind address (default 127.0.0.1). */
  host?: string;
  /** Port 0 = ephemeral. */
  port?: number;
  /** Upstream host (default openrouter.ai). */
  upstreamHost?: string;
  /** Injected for tests. */
  now?: () => Date;
}

export interface OpenRouterRequestProxy {
  url: string;
  host: string;
  port: number;
  counterPath: string;
  maxRequests: number;
  /** Current durable count (re-reads file). */
  readCount: () => Promise<number>;
  close: () => Promise<void>;
}

export class RequestCounterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestCounterError';
  }
}

export class RequestBudgetExhaustedError extends Error {
  readonly count: number;
  readonly max: number;
  constructor(count: number, max: number) {
    super(`OpenRouter request budget exhausted: ${count}/${max}`);
    this.name = 'RequestBudgetExhaustedError';
    this.count = count;
    this.max = max;
  }
}

function isFiniteNonNegInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && Math.floor(n) === n;
}

/** Parse and validate a counter file body. Throws RequestCounterError if corrupt. */
export function parseRequestCounter(raw: string): RequestCounterState {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new RequestCounterError('request counter is not valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestCounterError('request counter root must be an object');
  }
  const rec = body as Record<string, unknown>;
  if (rec.schema !== 'openrouter-request-counter/v1') {
    throw new RequestCounterError('request counter schema mismatch');
  }
  if (!isFiniteNonNegInt(rec.count) || !isFiniteNonNegInt(rec.max)) {
    throw new RequestCounterError('request counter count/max must be non-negative integers');
  }
  if (typeof rec.updatedAt !== 'string' || rec.updatedAt.length === 0) {
    throw new RequestCounterError('request counter updatedAt missing');
  }
  return {
    schema: 'openrouter-request-counter/v1',
    count: rec.count,
    max: rec.max,
    updatedAt: rec.updatedAt,
  };
}

export async function readRequestCounter(path: string): Promise<RequestCounterState> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    throw new RequestCounterError(
      `cannot read request counter at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseRequestCounter(raw);
}

export async function writeRequestCounter(
  path: string,
  state: RequestCounterState,
): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
    await rename(tmp, path);
  } catch (err) {
    throw new RequestCounterError(
      `cannot write request counter at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Atomically reserve the next request slot.
 * Returns the new count (1-based after increment).
 * Throws RequestBudgetExhaustedError if the next slot would exceed max.
 * Throws RequestCounterError if the file is unreadable/unwritable/corrupt.
 */
export async function reserveRequestSlot(
  path: string,
  max: number,
  now: () => Date = () => new Date(),
): Promise<number> {
  if (!isFiniteNonNegInt(max) || max < 1) {
    throw new RequestCounterError('maxRequests must be a positive integer');
  }
  let state: RequestCounterState;
  try {
    state = await readRequestCounter(path);
  } catch (err) {
    if (err instanceof RequestCounterError && /cannot read/.test(err.message)) {
      // First use: initialize. Still fail-closed if write fails.
      state = {
        schema: 'openrouter-request-counter/v1',
        count: 0,
        max,
        updatedAt: now().toISOString(),
      };
    } else {
      throw err;
    }
  }
  if (state.max !== max) {
    // Cap is immutable for the run; mismatch = corrupt / wrong file.
    throw new RequestCounterError(
      `request counter max mismatch: file=${state.max} expected=${max}`,
    );
  }
  if (state.count >= max) {
    throw new RequestBudgetExhaustedError(state.count, max);
  }
  const next: RequestCounterState = {
    schema: 'openrouter-request-counter/v1',
    count: state.count + 1,
    max,
    updatedAt: now().toISOString(),
  };
  await writeRequestCounter(path, next);
  return next.count;
}

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(raw),
  });
  res.end(raw);
}

/**
 * Start the fail-closed OpenRouter request proxy.
 * Point Claude Code at `proxy.url` via ANTHROPIC_BASE_URL.
 */
export async function startOpenRouterRequestProxy(
  options: OpenRouterRequestProxyOptions,
): Promise<OpenRouterRequestProxy> {
  const maxRequests = options.maxRequests ?? DEFAULT_OPENROUTER_REQUEST_CAP;
  const host = options.host ?? '127.0.0.1';
  const upstreamHost = options.upstreamHost ?? OPENROUTER_UPSTREAM_HOST;
  const now = options.now ?? (() => new Date());
  const counterPath = options.counterPath;

  // Initialize durable counter before accepting traffic.
  // Missing file → create zeros. Corrupt / mismatched → fail closed (do not start).
  try {
    const existing = await readRequestCounter(counterPath);
    if (existing.max !== maxRequests) {
      throw new RequestCounterError(
        `request counter max mismatch: file=${existing.max} expected=${maxRequests}`,
      );
    }
  } catch (err) {
    if (err instanceof RequestCounterError && /cannot read/.test(err.message)) {
      await writeRequestCounter(counterPath, {
        schema: 'openrouter-request-counter/v1',
        count: 0,
        max: maxRequests,
        updatedAt: now().toISOString(),
      });
    } else {
      throw err;
    }
  }

  const server: Server = createServer(async (req, res) => {
    try {
      let reserved: number;
      try {
        reserved = await reserveRequestSlot(counterPath, maxRequests, now);
      } catch (err) {
        if (err instanceof RequestBudgetExhaustedError) {
          sendJson(res, 429, {
            error: {
              message: err.message,
              type: 'request_budget_exhausted',
              count: err.count,
              max: err.max,
            },
          });
          return;
        }
        sendJson(res, 503, {
          error: {
            message: err instanceof Error ? err.message : String(err),
            type: 'request_counter_unavailable',
          },
        });
        return;
      }

      const body = await collectBody(req);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        if (k.toLowerCase() === 'host') continue;
        headers[k] = Array.isArray(v) ? v.join(',') : v;
      }
      headers.host = upstreamHost;
      // Trace which slot this was (no secrets).
      headers['x-cc-request-slot'] = String(reserved);

      await new Promise<void>((resolve, reject) => {
        const upstream = httpsRequest(
          {
            hostname: upstreamHost,
            port: 443,
            path: req.url ?? '/',
            method: req.method ?? 'GET',
            headers,
          },
          (upRes) => {
            const outHeaders = { ...upRes.headers } as Record<string, string | string[] | undefined>;
            res.writeHead(upRes.statusCode ?? 502, outHeaders);
            upRes.pipe(res);
            upRes.on('end', () => resolve());
            upRes.on('error', reject);
          },
        );
        upstream.on('error', (e) => {
          if (!res.headersSent) {
            sendJson(res, 502, {
              error: { message: `upstream error: ${e.message}`, type: 'upstream_error' },
            });
          }
          reject(e);
        });
        if (body.length > 0) upstream.write(body);
        upstream.end();
      }).catch(() => {
        // Response already handled in handlers above when possible.
      });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: {
            message: err instanceof Error ? err.message : String(err),
            type: 'proxy_internal_error',
          },
        });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new RequestCounterError('proxy failed to bind a TCP port');
  }

  return {
    url: `http://${host}:${addr.port}`,
    host,
    port: addr.port,
    counterPath,
    maxRequests,
    readCount: async () => (await readRequestCounter(counterPath)).count,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Default counter path under the OS temp dir for a given run id. */
export function defaultRequestCounterPath(runId: string): string {
  return join(tmpdir(), 'cc-bench-request-counter', `${runId}.json`);
}
