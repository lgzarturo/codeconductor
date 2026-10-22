/**
 * Fail-closed local proxy between Claude Code and OpenRouter.
 *
 * Counts every HTTP request forwarded to openrouter.ai (chat completions,
 * small-fast / haiku aliases, …). Persists the count to disk. Request N+1
 * when max=N is rejected and the run must abort.
 *
 * Auth: Claude presents a one-shot *local* token (ANTHROPIC_AUTH_TOKEN).
 * The proxy never forwards that token upstream; it injects OPENROUTER_API_KEY
 * only on the outbound hop. Claude's env must not contain OPENROUTER_API_KEY.
 *
 * Base URL: Claude Code (Anthropic SDK) appends `/v1/messages` to
 * `ANTHROPIC_BASE_URL`. The working direct config is
 * `https://openrouter.ai/api` → full path `/api/v1/messages`. Point Claude at
 * `proxy.anthropicBaseUrl` (`http://host:port/api`), and the proxy also
 * rewrites bare `/v1/…` → `/api/v1/…` as a safety net.
 *
 * Responses (including SSE) are piped without buffering. The local token is
 * never present in upstream request headers or in the response body we emit.
 *
 * If the counter file cannot be read or written, the proxy refuses to
 * forward (fail-closed).
 */
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export const DEFAULT_OPENROUTER_REQUEST_CAP = 100;
/** Sliding-window rate limit (Arturo / microsdd 0755fde): 20 requests / minute. */
export const DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN = 20;
export const OPENROUTER_RATE_LIMIT_WINDOW_MS = 60_000;
/** Max wait for a rate-limit slot before fail-closed abort (no 429). */
export const DEFAULT_OPENROUTER_RATE_WAIT_TIMEOUT_MS = 180_000;
export const OPENROUTER_UPSTREAM_HOST = 'openrouter.ai';
/** Prefix for one-shot local tokens — never a real OpenRouter key. */
export const PROXY_LOCAL_TOKEN_PREFIX = 'cc-proxy-local-';

/**
 * POST paths that consume the durable 100-request cap (messages only).
 * Matches inbound Anthropic `/v1/…` and OpenRouter `/api/v1/…` forms.
 */
export const COUNTABLE_POST_PATH_SUFFIXES = [
  '/v1/messages',
  '/v1/chat/completions',
  '/messages',
  '/chat/completions',
] as const;

export interface RequestCounterState {
  schema: 'openrouter-request-counter/v1';
  count: number;
  max: number;
  updatedAt: string;
}

export interface OpenRouterRequestProxyOptions {
  /** Absolute path to the durable counter JSON file. */
  counterPath: string;
  /** Real OpenRouter key — used ONLY on the outbound hop. */
  upstreamApiKey: string;
  /** One-shot token Claude must present; never forwarded upstream. */
  localAuthToken: string;
  /** Hard cap (inclusive). Request max+1 is rejected. Default 100. */
  maxRequests?: number;
  /**
   * Max countable POSTs per rolling 60s window. The limiter **waits** for a
   * slot (microsdd 0755fde) instead of returning 429 — Claude must not retry
   * loops on our own rate limit. Default
   * {@link DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN}.
   */
  maxRequestsPerMinute?: number;
  /** Max ms to wait for a rate-limit slot (default 180s). */
  rateWaitTimeoutMs?: number;
  /**
   * Seed the durable counter when the file does not yet exist (repo-accumulated
   * budget across Actions runs). Must be 0 ≤ initialCount ≤ maxRequests.
   */
  initialCount?: number;
  /** Bind address (default 127.0.0.1). */
  host?: string;
  /** Port 0 = ephemeral. */
  port?: number;
  /** Upstream host (default openrouter.ai). */
  upstreamHost?: string;
  /**
   * Test-only: forward over plain HTTP to `upstreamHost:upstreamPort`
   * (lets unit tests assert outbound Authorization without TLS).
   */
  useHttpUpstream?: boolean;
  upstreamPort?: number;
  /** Optional hop recorder (tests / diagnostics). Never pass secrets. */
  onHop?: (hop: ProxyHopRecord) => void;
  /** Injected for tests. */
  now?: () => Date;
}

/** Per-hop diagnostic (paths kept in-process for tests; scrub before logging). */
export interface ProxyHopRecord {
  method: string;
  inboundPath: string;
  upstreamPath: string;
  upstreamStatus: number | null;
  streamed: boolean;
}

/** Artifact-safe hop: method + upstream HTTP status only (no paths / tokens). */
export interface ProxyHopPublic {
  method: string;
  upstreamStatus: number | null;
  streamed: boolean;
}

/** Strip paths from hop records for logs and aggregates. */
export function publicProxyHops(hops: ProxyHopRecord[]): ProxyHopPublic[] {
  return hops.map((h) => ({
    method: h.method,
    upstreamStatus: h.upstreamStatus,
    streamed: h.streamed,
  }));
}

export interface OpenRouterRequestProxy {
  /** Origin only (`http://host:port`) — prefer `anthropicBaseUrl` for Claude. */
  url: string;
  /**
   * `ANTHROPIC_BASE_URL` for Claude Code — mirrors `https://openrouter.ai/api`
   * so `/v1/messages` resolves to `/api/v1/messages` upstream.
   */
  anthropicBaseUrl: string;
  host: string;
  port: number;
  counterPath: string;
  maxRequests: number;
  maxRequestsPerMinute: number;
  localAuthToken: string;
  /** Current durable count (re-reads file). */
  readCount: () => Promise<number>;
  /** Sanitized hop log for this process (newest last). */
  hops: () => ProxyHopRecord[];
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

export class RequestRateLimitError extends Error {
  readonly windowCount: number;
  readonly maxPerMinute: number;
  constructor(windowCount: number, maxPerMinute: number, message?: string) {
    super(
      message ??
        `OpenRouter proxy rate limit: wait exhausted for ${maxPerMinute}/min ` +
          `(window=${windowCount})`,
    );
    this.name = 'RequestRateLimitError';
    this.windowCount = windowCount;
    this.maxPerMinute = maxPerMinute;
  }
}

/** Pathname without query string. */
export function pathOnly(path: string): string {
  const raw = path && path.length > 0 ? path : '/';
  const q = raw.indexOf('?');
  return q >= 0 ? raw.slice(0, q) : raw;
}

/**
 * True only for POST message routes that must consume the durable 100 cap
 * (microsdd 0755fde / Arturo). HEAD, health, GET /models do not count.
 */
export function isCountableRequest(method: string, path: string): boolean {
  if ((method || '').toUpperCase() !== 'POST') return false;
  const p = pathOnly(path);
  for (const suffix of COUNTABLE_POST_PATH_SUFFIXES) {
    if (p === suffix || p.endsWith(suffix)) return true;
  }
  return false;
}

function isLocalHealthPath(path: string): boolean {
  const p = pathOnly(path);
  return p === '/health' || p.endsWith('/health');
}

/**
 * Sliding-window rate limiter (in-process). Waits for a free slot instead of
 * rejecting with 429 (Claude retries 429 in a loop).
 */
export class SlidingWindowRateLimiter {
  private readonly timestamps: number[] = [];
  readonly waitTimeoutMs: number;
  constructor(
    readonly maxPerWindow: number,
    readonly windowMs: number = OPENROUTER_RATE_LIMIT_WINDOW_MS,
    waitTimeoutMs: number = DEFAULT_OPENROUTER_RATE_WAIT_TIMEOUT_MS,
  ) {
    if (
      !Number.isFinite(maxPerWindow) ||
      maxPerWindow < 1 ||
      Math.floor(maxPerWindow) !== maxPerWindow
    ) {
      throw new RequestCounterError('maxRequestsPerMinute must be a positive integer');
    }
    if (!Number.isFinite(waitTimeoutMs) || waitTimeoutMs <= 0) {
      throw new RequestCounterError('rateWaitTimeoutMs must be a positive number');
    }
    this.waitTimeoutMs = waitTimeoutMs;
  }

  /** Prune and count timestamps still inside the window. */
  countInWindow(nowMs: number): number {
    this.prune(nowMs);
    return this.timestamps.length;
  }

  /**
   * Wait until a slot is free, then reserve it.
   * Throws {@link RequestRateLimitError} only if waitTimeoutMs elapses.
   */
  async acquire(nowMs: () => number = () => Date.now()): Promise<number> {
    const deadline = nowMs() + this.waitTimeoutMs;
    for (;;) {
      const t = nowMs();
      this.prune(t);
      if (this.timestamps.length < this.maxPerWindow) {
        this.timestamps.push(t);
        return this.timestamps.length;
      }
      if (t >= deadline) {
        throw new RequestRateLimitError(
          this.timestamps.length,
          this.maxPerWindow,
          `OpenRouter proxy rate limit ${this.maxPerWindow}/min: wait exhausted ` +
            `(${this.waitTimeoutMs}ms)`,
        );
      }
      const oldest = this.timestamps[0]!;
      const sleepFor = Math.min(
        Math.max(oldest + this.windowMs - t, 10),
        Math.max(deadline - t, 10),
      );
      await new Promise<void>((r) => setTimeout(r, sleepFor));
    }
  }

  /** @deprecated Prefer {@link acquire}. Sync try — throws if window full. */
  reserve(nowMs: number = Date.now()): number {
    this.prune(nowMs);
    if (this.timestamps.length >= this.maxPerWindow) {
      throw new RequestRateLimitError(this.timestamps.length, this.maxPerWindow);
    }
    this.timestamps.push(nowMs);
    return this.timestamps.length;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }
}

/** Mint a one-shot local token for Claude → proxy (not a real API key). */
export function mintProxyLocalToken(): string {
  return `${PROXY_LOCAL_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
}

export function isProxyLocalToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith(PROXY_LOCAL_TOKEN_PREFIX);
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

function extractBearer(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  const xApi = req.headers['x-api-key'];
  if (typeof xApi === 'string' && xApi.trim()) return xApi.trim();
  if (Array.isArray(xApi) && xApi[0]) return String(xApi[0]).trim();
  return null;
}

/**
 * Map Claude's Anthropic-SDK path onto OpenRouter's `/api` prefix.
 * `/v1/messages` → `/api/v1/messages`; already-prefixed paths unchanged.
 */
export function rewriteOpenRouterUpstreamPath(inboundPath: string): string {
  const raw = inboundPath && inboundPath.length > 0 ? inboundPath : '/';
  const qIndex = raw.indexOf('?');
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex) : '';
  if (pathname === '/v1' || pathname.startsWith('/v1/')) {
    return `/api${pathname}${query}`;
  }
  return raw;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'proxy-connection',
]);

function isSseContentType(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return /text\/event-stream/i.test(raw);
}

/**
 * Start the fail-closed OpenRouter request proxy.
 * Point Claude Code at `proxy.url` via ANTHROPIC_BASE_URL and give it
 * `localAuthToken` as ANTHROPIC_AUTH_TOKEN (never OPENROUTER_API_KEY).
 */
export async function startOpenRouterRequestProxy(
  options: OpenRouterRequestProxyOptions,
): Promise<OpenRouterRequestProxy> {
  if (!options.upstreamApiKey || !options.upstreamApiKey.trim()) {
    throw new RequestCounterError('upstreamApiKey is required');
  }
  if (!isProxyLocalToken(options.localAuthToken)) {
    throw new RequestCounterError(
      'localAuthToken must be a minted cc-proxy-local-* token',
    );
  }
  if (options.localAuthToken === options.upstreamApiKey) {
    throw new RequestCounterError('localAuthToken must not equal upstreamApiKey');
  }

  const maxRequests = options.maxRequests ?? DEFAULT_OPENROUTER_REQUEST_CAP;
  const maxRequestsPerMinute =
    options.maxRequestsPerMinute ?? DEFAULT_OPENROUTER_RATE_LIMIT_PER_MIN;
  const rateWaitTimeoutMs =
    options.rateWaitTimeoutMs ?? DEFAULT_OPENROUTER_RATE_WAIT_TIMEOUT_MS;
  const initialCount = options.initialCount ?? 0;
  if (!isFiniteNonNegInt(initialCount) || initialCount > maxRequests) {
    throw new RequestCounterError(
      `initialCount must be an integer in [0, ${maxRequests}]`,
    );
  }
  const host = options.host ?? '127.0.0.1';
  const upstreamHost = options.upstreamHost ?? OPENROUTER_UPSTREAM_HOST;
  const now = options.now ?? (() => new Date());
  const counterPath = options.counterPath;
  const localAuthToken = options.localAuthToken;
  const upstreamApiKey = options.upstreamApiKey;
  const rateLimiter = new SlidingWindowRateLimiter(
    maxRequestsPerMinute,
    OPENROUTER_RATE_LIMIT_WINDOW_MS,
    rateWaitTimeoutMs,
  );

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
        count: initialCount,
        max: maxRequests,
        updatedAt: now().toISOString(),
      });
    } else {
      throw err;
    }
  }

  const hopLog: ProxyHopRecord[] = [];
  const recordHop = (hop: ProxyHopRecord): void => {
    hopLog.push(hop);
    options.onHop?.(hop);
  };

  const server: Server = createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const inboundPath = req.url ?? '/';
    let upstreamPath = rewriteOpenRouterUpstreamPath(inboundPath);
    try {
      const presented = extractBearer(req);
      if (presented !== localAuthToken) {
        recordHop({
          method,
          inboundPath,
          upstreamPath,
          upstreamStatus: 401,
          streamed: false,
        });
        sendJson(res, 401, {
          type: 'error',
          error: {
            message: 'invalid or missing local proxy token',
            type: 'proxy_auth_failed',
          },
        });
        return;
      }

      // HEAD and /health are local — no forward, no durable slot (microsdd 0755fde).
      if (method.toUpperCase() === 'HEAD' || isLocalHealthPath(inboundPath)) {
        let count = 0;
        try {
          count = (await readRequestCounter(counterPath)).count;
        } catch {
          count = -1;
        }
        recordHop({
          method,
          inboundPath,
          upstreamPath,
          upstreamStatus: 200,
          streamed: false,
        });
        if (method.toUpperCase() === 'HEAD') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end();
        } else {
          sendJson(res, 200, {
            ok: true,
            count,
            max: maxRequests,
          });
        }
        return;
      }

      // Read body before counting so parse failures do not burn a slot.
      const body = await collectBody(req);
      const countable = isCountableRequest(method, inboundPath);

      let reserved: number | null = null;
      if (countable) {
        // Wait for rpm slot (never 429 — Claude retries 429 in a loop).
        try {
          await rateLimiter.acquire(() => now().getTime());
        } catch (err) {
          if (err instanceof RequestRateLimitError) {
            recordHop({
              method,
              inboundPath,
              upstreamPath,
              upstreamStatus: 403,
              streamed: false,
            });
            sendJson(res, 403, {
              type: 'error',
              error: {
                message: err.message,
                type: 'cc_proxy_rate_wait_timeout',
                windowCount: err.windowCount,
                maxPerMinute: err.maxPerMinute,
              },
            });
            return;
          }
          throw err;
        }
        try {
          reserved = await reserveRequestSlot(counterPath, maxRequests, now);
        } catch (err) {
          if (err instanceof RequestBudgetExhaustedError) {
            // 403 not 429 — avoid Claude SDK retry storms (microsdd 0755fde).
            recordHop({
              method,
              inboundPath,
              upstreamPath,
              upstreamStatus: 403,
              streamed: false,
            });
            sendJson(res, 403, {
              type: 'error',
              error: {
                message: err.message,
                type: 'cc_proxy_budget',
                count: err.count,
                max: err.max,
              },
            });
            return;
          }
          recordHop({
            method,
            inboundPath,
            upstreamPath,
            upstreamStatus: 503,
            streamed: false,
          });
          sendJson(res, 503, {
            type: 'error',
            error: {
              message: err instanceof Error ? err.message : String(err),
              type: 'request_counter_unavailable',
            },
          });
          return;
        }
      }

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        const lk = k.toLowerCase();
        // Never forward Host, inbound Authorization, x-api-key, or hop-by-hop.
        if (lk === 'host' || lk === 'authorization' || lk === 'x-api-key') continue;
        if (HOP_BY_HOP.has(lk)) continue;
        headers[k] = Array.isArray(v) ? v.join(',') : v;
      }
      headers.host = upstreamHost;
      // Inject real OpenRouter key only on the outbound hop (never the local token).
      headers.authorization = `Bearer ${upstreamApiKey}`;
      headers['content-length'] = String(body.length);
      if (reserved !== null) {
        headers['x-cc-request-slot'] = String(reserved);
      }

      const useHttp = options.useHttpUpstream === true;
      const upstreamPort = useHttp ? (options.upstreamPort ?? 80) : 443;
      const transport = useHttp ? httpRequest : httpsRequest;

      await new Promise<void>((resolve, reject) => {
        const upstream = transport(
          {
            hostname: upstreamHost,
            port: upstreamPort,
            path: upstreamPath,
            method,
            headers,
          },
          (upRes) => {
            const status = upRes.statusCode ?? 502;
            const streamed = isSseContentType(upRes.headers['content-type']);
            recordHop({
              method,
              inboundPath,
              upstreamPath,
              upstreamStatus: status,
              streamed,
            });

            const outHeaders: Record<string, number | string | string[]> = {};
            for (const [k, v] of Object.entries(upRes.headers)) {
              if (v === undefined) continue;
              const lk = k.toLowerCase();
              // Drop hop-by-hop; Node will re-chunk the piped body as needed.
              if (HOP_BY_HOP.has(lk)) continue;
              // Never leak the local token via echo headers.
              if (lk === 'authorization' || lk === 'x-api-key') continue;
              outHeaders[k] = v;
            }
            // SSE / event-stream: never advertise a fixed length (would buffer).
            if (streamed) {
              delete outHeaders['content-length'];
            }
            res.writeHead(status, outHeaders);
            // Pipe without buffering so SSE flushes promptly (end:true closes client).
            upRes.pipe(res, { end: true });
            upRes.on('end', () => resolve());
            upRes.on('error', reject);
            res.on('error', reject);
          },
        );
        upstream.on('error', (e) => {
          recordHop({
            method,
            inboundPath,
            upstreamPath,
            upstreamStatus: 502,
            streamed: false,
          });
          if (!res.headersSent) {
            sendJson(res, 502, {
              type: 'error',
              error: {
                message: `upstream error: ${e.message}`,
                type: 'upstream_error',
              },
            });
          }
          reject(e);
        });
        if (body.length > 0) upstream.write(body);
        upstream.end();
      }).catch(() => {
        // Response already handled when possible.
      });
    } catch (err) {
      recordHop({
        method,
        inboundPath,
        upstreamPath,
        upstreamStatus: 500,
        streamed: false,
      });
      if (!res.headersSent) {
        sendJson(res, 500, {
          type: 'error',
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

  const origin = `http://${host}:${addr.port}`;
  return {
    url: origin,
    anthropicBaseUrl: `${origin}/api`,
    host,
    port: addr.port,
    counterPath,
    maxRequests,
    maxRequestsPerMinute,
    localAuthToken,
    readCount: async () => (await readRequestCounter(counterPath)).count,
    hops: () => hopLog.slice(),
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

/**
 * Build Claude child env: no OPENROUTER_API_KEY; local proxy token only.
 * Exported for tests.
 */
export function buildClaudeChildEnv(input: {
  modelId: string;
  proxyBaseUrl: string;
  localAuthToken: string;
  parentEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  if (!isProxyLocalToken(input.localAuthToken)) {
    throw new RequestCounterError('localAuthToken must be a minted cc-proxy-local-* token');
  }
  const parent = input.parentEnv ?? process.env;
  // Whitelist — never copy OPENROUTER_API_KEY or a real sk-or token.
  const env: NodeJS.ProcessEnv = {
    PATH: parent.PATH,
    HOME: parent.HOME,
    USER: parent.USER,
    LANG: parent.LANG,
    TMPDIR: parent.TMPDIR,
    XDG_STATE_HOME: parent.XDG_STATE_HOME,
    CI: 'true',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    // microsdd 0755fde: no SDK retry storms on proxy 403/network blips.
    CLAUDE_CODE_MAX_RETRIES: '0',
    ANTHROPIC_MAX_RETRIES: '0',
    CLAUDE_CODE_VERSION: parent.CLAUDE_CODE_VERSION,
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_BASE_URL: input.proxyBaseUrl,
    ANTHROPIC_AUTH_TOKEN: input.localAuthToken,
    ANTHROPIC_MODEL: input.modelId,
    ANTHROPIC_SMALL_FAST_MODEL: input.modelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: input.modelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: input.modelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: input.modelId,
    CLAUDE_CODE_SUBAGENT_MODEL: input.modelId,
  };
  // Explicitly ensure the real key is absent.
  delete env.OPENROUTER_API_KEY;
  return env;
}
