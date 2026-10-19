/**
 * Zero-spend lock for OpenRouter cheap/free mode (Arturo).
 * Reusable by M5 bench: abort before the first call when the run could spend.
 *
 * Rules (fail-closed) — Arturo 2026-10-19:
 * 1. modelId must end with the exact lowercase suffix `:free` (not `:FREE` / `:Free`).
 * 2. Key `limit` must be a finite number ≤ configurable cap (default **$5**).
 *    `limit: null` / unlimited, or `limit` above the cap → abort.
 * 3. Capture `usage` before the run (or task); re-read after. If usage rises
 *    (Δ > 0) → abort and mark the run invalid. Expected spend: **$0**.
 * 4. Missing, mistyped, or unparseable /api/v1/key fields abort; HTTP errors
 *    and invalid JSON abort.
 * API keys are read only from the environment — never from files.
 */

export const DEFAULT_OPENROUTER_LIMIT_CAP_USD = 5;

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
  /** Optional credit/balance fields when the API exposes them. */
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
  /**
   * Max allowed key `limit` in USD (Arturo: real key has $5/mo).
   * Default {@link DEFAULT_OPENROUTER_LIMIT_CAP_USD}.
   */
  maxLimitUsd?: number;
}

export interface OpenRouterSpendLockResult {
  ok: boolean;
  reason: string | null;
  checkedModel: boolean;
  checkedKey: boolean;
  key: OpenRouterKeySnapshot | null;
  /** Baseline usage captured when the pre-run check succeeds. */
  usageBefore: number | null;
}

export interface OpenRouterUsageDeltaInput {
  usageBefore: number;
  /** Post-run snapshot. When omitted, fetched via fetchKey / env. */
  keyAfter?: OpenRouterKeySnapshot | null;
  fetchKey?: () => Promise<OpenRouterKeySnapshot | null>;
}

export interface OpenRouterUsageDeltaResult {
  ok: boolean;
  reason: string | null;
  usageBefore: number;
  usageAfter: number | null;
  deltaUsd: number | null;
  /** False when Δ usage > 0 — callers must treat the run as invalid. */
  runValid: boolean;
  keyAfter: OpenRouterKeySnapshot | null;
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
 * True when `limit` is a finite number ≤ maxLimitUsd (default $5).
 * null / unlimited / non-finite / above cap ⇒ false.
 */
export function keyLimitWithinCap(
  key: OpenRouterKeySnapshot,
  maxLimitUsd: number = DEFAULT_OPENROUTER_LIMIT_CAP_USD,
): boolean {
  if (!isFiniteNumber(maxLimitUsd) || maxLimitUsd < 0) return false;
  if (!isFiniteNumber(key.limit)) return false;
  return key.limit <= maxLimitUsd;
}

/**
 * @deprecated Prefer {@link keyLimitWithinCap}. Kept as a named alias for
 * “policy rejects this key for zero-spend” (inverted: true ⇒ abort).
 */
export function keyAllowsPaidSpend(
  key: OpenRouterKeySnapshot,
  maxLimitUsd: number = DEFAULT_OPENROUTER_LIMIT_CAP_USD,
): boolean {
  return !keyLimitWithinCap(key, maxLimitUsd);
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

async function resolveKeySnapshot(
  input: Pick<OpenRouterSpendLockInput, 'key' | 'fetchKey'>,
): Promise<OpenRouterKeySnapshot | null> {
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
  return key;
}

/**
 * Pre-run gate: `:free` model + key `limit` ≤ cap (default $5) + finite usage baseline.
 * Returns `{ ok: false, reason }` instead of throwing so callers can format errors.
 */
export async function assertOpenRouterZeroSpend(
  input: OpenRouterSpendLockInput,
): Promise<OpenRouterSpendLockResult> {
  const maxLimitUsd = input.maxLimitUsd ?? DEFAULT_OPENROUTER_LIMIT_CAP_USD;

  if (!isOpenRouterFreeModel(input.modelId)) {
    return {
      ok: false,
      reason: `OpenRouter zero-spend lock: model "${input.modelId}" does not end with :free`,
      checkedModel: true,
      checkedKey: false,
      key: null,
      usageBefore: null,
    };
  }

  if (input.skipKeyCheck) {
    return {
      ok: true,
      reason: null,
      checkedModel: true,
      checkedKey: false,
      key: null,
      usageBefore: null,
    };
  }

  const key = await resolveKeySnapshot(input);

  if (!key) {
    // Model is :free and no key to verify — allow with unchecked key.
    return {
      ok: true,
      reason: null,
      checkedModel: true,
      checkedKey: false,
      key: null,
      usageBefore: null,
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
      usageBefore: null,
    };
  }

  if (!isFiniteNumber(key.limit)) {
    return {
      ok: false,
      reason:
        'OpenRouter zero-spend lock: key limit is null or unlimited (fail-closed; expected finite limit ≤ cap)',
      checkedModel: true,
      checkedKey: true,
      key,
      usageBefore: null,
    };
  }

  if (!keyLimitWithinCap(key, maxLimitUsd)) {
    return {
      ok: false,
      reason: `OpenRouter zero-spend lock: key limit ${key.limit} exceeds cap ${maxLimitUsd} USD`,
      checkedModel: true,
      checkedKey: true,
      key,
      usageBefore: null,
    };
  }

  if (!isFiniteNumber(key.usage)) {
    return {
      ok: false,
      reason:
        'OpenRouter zero-spend lock: key usage is missing or not a finite number (cannot establish $0 baseline)',
      checkedModel: true,
      checkedKey: true,
      key,
      usageBefore: null,
    };
  }

  return {
    ok: true,
    reason: null,
    checkedModel: true,
    checkedKey: true,
    key,
    usageBefore: key.usage,
  };
}

/** Throw if the pre-run lock fails — convenient for bench runners (M5). */
export async function enforceOpenRouterZeroSpend(
  input: OpenRouterSpendLockInput,
): Promise<OpenRouterSpendLockResult> {
  const result = await assertOpenRouterZeroSpend(input);
  if (!result.ok) {
    throw new Error(result.reason ?? 'OpenRouter zero-spend lock aborted');
  }
  return result;
}

/**
 * Post-run (or per-task) check: usage must not rise (expected Δ = $0).
 * When Δ > 0, `runValid` is false — callers must mark the run invalid.
 */
export async function assertOpenRouterUsageUnchanged(
  input: OpenRouterUsageDeltaInput,
): Promise<OpenRouterUsageDeltaResult> {
  if (!isFiniteNumber(input.usageBefore)) {
    return {
      ok: false,
      reason: 'OpenRouter zero-spend lock: usageBefore is not a finite number',
      usageBefore: input.usageBefore,
      usageAfter: null,
      deltaUsd: null,
      runValid: false,
      keyAfter: null,
    };
  }

  const keyAfter = await resolveKeySnapshot({
    key: input.keyAfter,
    fetchKey: input.fetchKey,
  });

  if (!keyAfter) {
    return {
      ok: false,
      reason: 'OpenRouter zero-spend lock: could not re-read /api/v1/key after run (fail-closed)',
      usageBefore: input.usageBefore,
      usageAfter: null,
      deltaUsd: null,
      runValid: false,
      keyAfter: null,
    };
  }

  if (!keySnapshotIsComplete(keyAfter) || !isFiniteNumber(keyAfter.usage)) {
    return {
      ok: false,
      reason:
        'OpenRouter zero-spend lock: post-run /api/v1/key usage is incomplete or unparseable (fail-closed)',
      usageBefore: input.usageBefore,
      usageAfter: null,
      deltaUsd: null,
      runValid: false,
      keyAfter,
    };
  }

  const deltaUsd = keyAfter.usage - input.usageBefore;
  if (deltaUsd > 0) {
    return {
      ok: false,
      reason: `OpenRouter zero-spend lock: usage rose by ${deltaUsd} USD (expected $0); run is invalid`,
      usageBefore: input.usageBefore,
      usageAfter: keyAfter.usage,
      deltaUsd,
      runValid: false,
      keyAfter,
    };
  }

  return {
    ok: true,
    reason: null,
    usageBefore: input.usageBefore,
    usageAfter: keyAfter.usage,
    deltaUsd,
    runValid: true,
    keyAfter,
  };
}

/** Throw if post-run usage rose — marks spend; callers treat the run as invalid. */
export async function enforceOpenRouterUsageUnchanged(
  input: OpenRouterUsageDeltaInput,
): Promise<OpenRouterUsageDeltaResult> {
  const result = await assertOpenRouterUsageUnchanged(input);
  if (!result.ok) {
    throw new Error(result.reason ?? 'OpenRouter zero-spend lock: usage delta aborted');
  }
  return result;
}
