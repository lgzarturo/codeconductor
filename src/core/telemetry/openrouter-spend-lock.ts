/**
 * Zero-spend lock for OpenRouter cheap/free mode (Arturo).
 * Reusable by M5 bench: abort before the first call when the run could spend.
 *
 * Rules (fail-closed):
 * 1. modelId must end with the exact lowercase suffix `:free` (not `:FREE` / `:Free`).
 * 2. When a key snapshot is checked, every required /api/v1/key field must be
 *    present and parseable; incomplete or mistyped bodies abort.
 * 3. Abort if limit, limitRemaining, paid usage, or credit balance indicate
 *    spend capacity > 0 (including limitRemaining > 0 with limit: null).
 * API keys are read only from the environment — never from files.
 */

export interface OpenRouterKeySnapshot {
  /** Credit/usage limit on the key (USD). null = unlimited / unset (explicit). */
  limit: number | null;
  /** Remaining credit against limit, when present. */
  limitRemaining: number | null;
  /** Lifetime or period usage in USD, when present. */
  usage: number | null;
  /** True when OpenRouter reports the key as free-tier. */
  isFreeTier: boolean;
  /** Raw label for diagnostics (never a secret). */
  label: string | null;
  /**
   * Optional credit/balance fields when the API exposes them.
   * > 0 ⇒ paid spend capacity.
   */
  balance?: number | null;
  credits?: number | null;
}

export interface OpenRouterSpendLockInput {
  modelId: string;
  /** Pre-fetched key snapshot. When omitted, fetched if OPENROUTER_API_KEY is set. */
  key?: OpenRouterKeySnapshot | null;
  /** Injected fetcher for tests. */
  fetchKey?: () => Promise<OpenRouterKeySnapshot | null>;
  /** Skip network; only enforce the `:free` suffix. */
  skipKeyCheck?: boolean;
}

export interface OpenRouterSpendLockResult {
  ok: boolean;
  reason: string | null;
  checkedModel: boolean;
  checkedKey: boolean;
  key: OpenRouterKeySnapshot | null;
}

const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';

const REQUIRED_KEY_FIELDS = [
  'limit',
  'limit_remaining',
  'usage',
  'is_free_tier',
] as const;

/** Exact lowercase `:free` suffix — rejects `:FREE`, `:Free`, and aliases. */
export function isOpenRouterFreeModel(modelId: string): boolean {
  return modelId.trim().endsWith(':free');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A snapshot is complete only when required spend fields are present with
 * expected types (null is allowed only where the API uses explicit null).
 */
export function keySnapshotIsComplete(key: OpenRouterKeySnapshot): boolean {
  const limitOk = key.limit === null || isFiniteNumber(key.limit);
  const remOk = key.limitRemaining === null || isFiniteNumber(key.limitRemaining);
  const usageOk = key.usage === null || isFiniteNumber(key.usage);
  const freeOk = typeof key.isFreeTier === 'boolean';
  const labelOk = key.label === null || typeof key.label === 'string';
  const balanceOk =
    key.balance === undefined || key.balance === null || isFiniteNumber(key.balance);
  const creditsOk =
    key.credits === undefined || key.credits === null || isFiniteNumber(key.credits);
  return limitOk && remOk && usageOk && freeOk && labelOk && balanceOk && creditsOk;
}

/**
 * Evaluate whether a paid spend path is open on the key.
 * Any positive limit, remaining balance, paid-tier flag, or credit balance ⇒ not zero-spend.
 */
export function keyAllowsPaidSpend(key: OpenRouterKeySnapshot): boolean {
  if (key.isFreeTier === false) return true;
  if (isFiniteNumber(key.limit) && key.limit > 0) return true;
  // Remaining paid balance aborts even when limit is null/unset.
  if (isFiniteNumber(key.limitRemaining) && key.limitRemaining > 0) return true;
  if (isFiniteNumber(key.balance) && key.balance > 0) return true;
  if (isFiniteNumber(key.credits) && key.credits > 0) return true;
  // Paid usage with a non-free tier is already covered by isFreeTier === false.
  // Positive usage alone on an explicit free tier does not imply remaining capacity.
  return false;
}

export function readOpenRouterApiKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.OPENROUTER_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function requirePresent(data: Record<string, unknown>, field: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(data, field)) {
    throw new Error(
      `OpenRouter /api/v1/key incomplete: missing field "${field}"`,
    );
  }
  return data[field];
}

function parseNullableNumberField(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (isFiniteNumber(value)) return value;
  throw new Error(
    `OpenRouter /api/v1/key incomplete: field "${field}" has unexpected type`,
  );
}

function parseRequiredBooleanField(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value;
  throw new Error(
    `OpenRouter /api/v1/key incomplete: field "${field}" has unexpected type`,
  );
}

function parseOptionalLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  throw new Error(
    'OpenRouter /api/v1/key incomplete: field "label" has unexpected type',
  );
}

/**
 * Parse /api/v1/key JSON. Fail-closed: missing, mistyped, or unparseable
 * required fields throw (never coerce to a "safe" empty snapshot).
 */
export function parseOpenRouterKeyBody(body: unknown): OpenRouterKeySnapshot {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('OpenRouter /api/v1/key incomplete: body is not an object');
  }
  const root = body as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(root, 'data')) {
    throw new Error('OpenRouter /api/v1/key incomplete: missing field "data"');
  }
  if (root.data === null || typeof root.data !== 'object' || Array.isArray(root.data)) {
    throw new Error('OpenRouter /api/v1/key incomplete: "data" is not an object');
  }
  const data = root.data as Record<string, unknown>;

  for (const field of REQUIRED_KEY_FIELDS) {
    requirePresent(data, field);
  }

  const snapshot: OpenRouterKeySnapshot = {
    limit: parseNullableNumberField(data.limit, 'limit'),
    limitRemaining: parseNullableNumberField(data.limit_remaining, 'limit_remaining'),
    usage: parseNullableNumberField(data.usage, 'usage'),
    isFreeTier: parseRequiredBooleanField(data.is_free_tier, 'is_free_tier'),
    label: parseOptionalLabel(data.label),
  };

  if (Object.prototype.hasOwnProperty.call(data, 'balance')) {
    snapshot.balance = parseNullableNumberField(data.balance, 'balance');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'credits')) {
    snapshot.credits = parseNullableNumberField(data.credits, 'credits');
  }

  return snapshot;
}

/**
 * GET /api/v1/key using the env key. Never logs or returns the key itself.
 * Throws on HTTP errors or incomplete/unparseable bodies (fail-closed).
 */
export async function fetchOpenRouterKeySnapshot(
  options: {
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<OpenRouterKeySnapshot | null> {
  const apiKey = options.apiKey ?? readOpenRouterApiKeyFromEnv();
  if (!apiKey) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(OPENROUTER_KEY_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /api/v1/key failed: HTTP ${res.status}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('OpenRouter /api/v1/key incomplete: response body is not JSON');
  }
  return parseOpenRouterKeyBody(body);
}

/**
 * Abort-before-call gate for OpenRouter zero-spend mode.
 * Returns `{ ok: false, reason }` instead of throwing so callers can format errors.
 * Incomplete key snapshots and paid-capacity signals always abort (fail-closed).
 */
export async function assertOpenRouterZeroSpend(
  input: OpenRouterSpendLockInput,
): Promise<OpenRouterSpendLockResult> {
  if (!isOpenRouterFreeModel(input.modelId)) {
    return {
      ok: false,
      reason: `OpenRouter zero-spend lock: model "${input.modelId}" does not end with :free`,
      checkedModel: true,
      checkedKey: false,
      key: null,
    };
  }

  if (input.skipKeyCheck) {
    return {
      ok: true,
      reason: null,
      checkedModel: true,
      checkedKey: false,
      key: null,
    };
  }

  let key = input.key ?? null;
  if (key === undefined || key === null) {
    if (input.fetchKey) {
      key = await input.fetchKey();
    } else if (readOpenRouterApiKeyFromEnv()) {
      key = await fetchOpenRouterKeySnapshot();
    } else {
      key = null;
    }
  }

  if (!key) {
    // Model is :free and no key to verify — allow with unchecked key.
    return {
      ok: true,
      reason: null,
      checkedModel: true,
      checkedKey: false,
      key: null,
    };
  }

  if (!keySnapshotIsComplete(key)) {
    return {
      ok: false,
      reason:
        'OpenRouter zero-spend lock: /api/v1/key response is incomplete or unparseable (fail-closed)',
      checkedModel: true,
      checkedKey: true,
      key,
    };
  }

  if (keyAllowsPaidSpend(key)) {
    return {
      ok: false,
      reason:
        'OpenRouter zero-spend lock: /api/v1/key reports a paid limit, remaining balance, or non-free tier (spend capacity > 0)',
      checkedModel: true,
      checkedKey: true,
      key,
    };
  }

  return {
    ok: true,
    reason: null,
    checkedModel: true,
    checkedKey: true,
    key,
  };
}

/** Throw if the lock fails — convenient for bench runners (M5). */
export async function enforceOpenRouterZeroSpend(
  input: OpenRouterSpendLockInput,
): Promise<OpenRouterSpendLockResult> {
  const result = await assertOpenRouterZeroSpend(input);
  if (!result.ok) {
    throw new Error(result.reason ?? 'OpenRouter zero-spend lock aborted');
  }
  return result;
}
