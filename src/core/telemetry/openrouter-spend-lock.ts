/**
 * OpenRouter spend lock for cheap bench mode (Arturo).
 * Reusable by M5 bench: abort before the first call when the run could overspend.
 *
 * Rules (fail-closed) — Arturo 2026-10-22:
 * 1. Models may be `:free` **or** paid (free-tier exhaustion / $10 credit).
 * 2. Repo spend cap: usage Δ ≤ configurable max (default **$5**), verified with
 *    `/api/v1/key` usage before and after. Abort when Δ approaches the cap
 *    (default approach threshold = 90% of max).
 * 3. Missing, mistyped, or unparseable /api/v1/key fields abort; HTTP errors
 *    and invalid JSON abort.
 * API keys are read only from the environment — never from files.
 *
 * Historical name `assertOpenRouterZeroSpend` is kept for callers; it no longer
 * requires `:free` or key `limit` ≤ $5 (credit may be $10).
 */

/** Max allowed usage Δ (USD) per repo for cheap bench. */
export const DEFAULT_OPENROUTER_SPEND_CAP_USD = 5;
/** @deprecated Alias — same value as {@link DEFAULT_OPENROUTER_SPEND_CAP_USD}. */
export const DEFAULT_OPENROUTER_LIMIT_CAP_USD = DEFAULT_OPENROUTER_SPEND_CAP_USD;

/** Abort when spent ≥ this fraction of the cap ("approaching"). */
export const DEFAULT_OPENROUTER_SPEND_APPROACH_FRACTION = 0.9;

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
  /** Skip network; only record the model id check (always ok under paid-allowed rules). */
  skipKeyCheck?: boolean;
  /**
   * Max allowed usage Δ in USD for this repo (Arturo: $5).
   * Default {@link DEFAULT_OPENROUTER_SPEND_CAP_USD}.
   */
  maxSpendUsd?: number;
  /**
   * @deprecated Prefer {@link maxSpendUsd}. Accepted for older callers; treated
   * as the spend cap (not a key-limit cap).
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
  maxSpendUsd: number;
}

export interface OpenRouterUsageDeltaInput {
  usageBefore: number;
  /** Post-run snapshot. When omitted, fetched via fetchKey / env. */
  keyAfter?: OpenRouterKeySnapshot | null;
  fetchKey?: () => Promise<OpenRouterKeySnapshot | null>;
  /** Max allowed usage Δ (USD). Default {@link DEFAULT_OPENROUTER_SPEND_CAP_USD}. */
  maxSpendUsd?: number;
  /**
   * Abort when Δ ≥ this value ("approaching" the cap). Default =
   * maxSpendUsd × {@link DEFAULT_OPENROUTER_SPEND_APPROACH_FRACTION}.
   */
  approachUsd?: number;
}

export interface OpenRouterUsageDeltaResult {
  ok: boolean;
  reason: string | null;
  usageBefore: number;
  usageAfter: number | null;
  deltaUsd: number | null;
  /** False when Δ exceeds / approaches the spend cap — callers mark run invalid. */
  runValid: boolean;
  keyAfter: OpenRouterKeySnapshot | null;
  maxSpendUsd: number;
  approachUsd: number;
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

function resolveMaxSpendUsd(input: {
  maxSpendUsd?: number;
  maxLimitUsd?: number;
}): number {
  const raw = input.maxSpendUsd ?? input.maxLimitUsd ?? DEFAULT_OPENROUTER_SPEND_CAP_USD;
  return raw;
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
 * Kept for diagnostics; the spend lock no longer requires this (credit may be $10).
 */
export function keyLimitWithinCap(
  key: OpenRouterKeySnapshot,
  maxLimitUsd: number = DEFAULT_OPENROUTER_SPEND_CAP_USD,
): boolean {
  if (!isFiniteNumber(maxLimitUsd) || maxLimitUsd < 0) return false;
  if (!isFiniteNumber(key.limit)) return false;
  return key.limit <= maxLimitUsd;
}

/**
 * @deprecated Prefer spend-cap checks. Kept as a named alias for
 * “key limit above historical $5 label” (inverted: true ⇒ over historical cap).
 */
export function keyAllowsPaidSpend(
  key: OpenRouterKeySnapshot,
  maxLimitUsd: number = DEFAULT_OPENROUTER_SPEND_CAP_USD,
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
 * Pre-run gate: finite usage baseline + spend cap configured.
 * Paid and `:free` models are both allowed (Arturo 22 Oct).
 */
export async function assertOpenRouterZeroSpend(
  input: OpenRouterSpendLockInput,
): Promise<OpenRouterSpendLockResult> {
  const maxSpendUsd = resolveMaxSpendUsd(input);
  if (!isFiniteNumber(maxSpendUsd) || maxSpendUsd < 0) {
    return {
      ok: false,
      reason: `OpenRouter spend lock: maxSpendUsd must be a finite number ≥ 0 (got ${maxSpendUsd})`,
      checkedModel: true,
      checkedKey: false,
      key: null,
      usageBefore: null,
      maxSpendUsd,
    };
  }

  // modelId is recorded for diagnostics; :free is no longer required.
  if (!input.modelId || !input.modelId.trim()) {
    return {
      ok: false,
      reason: 'OpenRouter spend lock: modelId is required',
      checkedModel: true,
      checkedKey: false,
      key: null,
      usageBefore: null,
      maxSpendUsd,
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
      maxSpendUsd,
    };
  }

  const key = await resolveKeySnapshot(input);

  if (!key) {
    // No key to verify — allow with unchecked key (dry / offline).
    return {
      ok: true,
      reason: null,
      checkedModel: true,
      checkedKey: false,
      key: null,
      usageBefore: null,
      maxSpendUsd,
    };
  }

  if (!keySnapshotIsComplete(key)) {
    return {
      ok: false,
      reason:
        'OpenRouter spend lock: /api/v1/key response is incomplete or unparseable (fail-closed)',
      checkedModel: true,
      checkedKey: true,
      key,
      usageBefore: null,
      maxSpendUsd,
    };
  }

  if (!isFiniteNumber(key.usage)) {
    return {
      ok: false,
      reason:
        'OpenRouter spend lock: key usage is missing or not a finite number (cannot establish spend baseline)',
      checkedModel: true,
      checkedKey: true,
      key,
      usageBefore: null,
      maxSpendUsd,
    };
  }

  return {
    ok: true,
    reason: null,
    checkedModel: true,
    checkedKey: true,
    key,
    usageBefore: key.usage,
    maxSpendUsd,
  };
}

/** Throw if the pre-run lock fails — convenient for bench runners (M5). */
export async function enforceOpenRouterZeroSpend(
  input: OpenRouterSpendLockInput,
): Promise<OpenRouterSpendLockResult> {
  const result = await assertOpenRouterZeroSpend(input);
  if (!result.ok) {
    throw new Error(result.reason ?? 'OpenRouter spend lock aborted');
  }
  return result;
}

/**
 * Post-run (or per-task) check: usage Δ must stay under the repo spend cap.
 * Aborts when Δ ≥ approach threshold ("approaching") or Δ > max.
 */
export async function assertOpenRouterUsageWithinCap(
  input: OpenRouterUsageDeltaInput,
): Promise<OpenRouterUsageDeltaResult> {
  const maxSpendUsd = input.maxSpendUsd ?? DEFAULT_OPENROUTER_SPEND_CAP_USD;
  const approachUsd =
    input.approachUsd ?? maxSpendUsd * DEFAULT_OPENROUTER_SPEND_APPROACH_FRACTION;

  if (!isFiniteNumber(input.usageBefore)) {
    return {
      ok: false,
      reason: 'OpenRouter spend lock: usageBefore is not a finite number',
      usageBefore: input.usageBefore,
      usageAfter: null,
      deltaUsd: null,
      runValid: false,
      keyAfter: null,
      maxSpendUsd,
      approachUsd,
    };
  }

  if (!isFiniteNumber(maxSpendUsd) || maxSpendUsd < 0) {
    return {
      ok: false,
      reason: `OpenRouter spend lock: maxSpendUsd must be a finite number ≥ 0`,
      usageBefore: input.usageBefore,
      usageAfter: null,
      deltaUsd: null,
      runValid: false,
      keyAfter: null,
      maxSpendUsd,
      approachUsd,
    };
  }

  const keyAfter = await resolveKeySnapshot({
    key: input.keyAfter,
    fetchKey: input.fetchKey,
  });

  if (!keyAfter) {
    return {
      ok: false,
      reason: 'OpenRouter spend lock: could not re-read /api/v1/key after run (fail-closed)',
      usageBefore: input.usageBefore,
      usageAfter: null,
      deltaUsd: null,
      runValid: false,
      keyAfter: null,
      maxSpendUsd,
      approachUsd,
    };
  }

  if (!keySnapshotIsComplete(keyAfter) || !isFiniteNumber(keyAfter.usage)) {
    return {
      ok: false,
      reason:
        'OpenRouter spend lock: post-run /api/v1/key usage is incomplete or unparseable (fail-closed)',
      usageBefore: input.usageBefore,
      usageAfter: null,
      deltaUsd: null,
      runValid: false,
      keyAfter,
      maxSpendUsd,
      approachUsd,
    };
  }

  const deltaUsd = keyAfter.usage - input.usageBefore;
  if (deltaUsd > maxSpendUsd) {
    return {
      ok: false,
      reason: `OpenRouter spend lock: usage rose by ${deltaUsd} USD (cap ${maxSpendUsd} USD); run is invalid`,
      usageBefore: input.usageBefore,
      usageAfter: keyAfter.usage,
      deltaUsd,
      runValid: false,
      keyAfter,
      maxSpendUsd,
      approachUsd,
    };
  }
  if (deltaUsd >= approachUsd) {
    return {
      ok: false,
      reason: `OpenRouter spend lock: usage Δ ${deltaUsd} USD approaches cap ${maxSpendUsd} USD (threshold ${approachUsd}); aborting`,
      usageBefore: input.usageBefore,
      usageAfter: keyAfter.usage,
      deltaUsd,
      runValid: false,
      keyAfter,
      maxSpendUsd,
      approachUsd,
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
    maxSpendUsd,
    approachUsd,
  };
}

/**
 * @deprecated Prefer {@link assertOpenRouterUsageWithinCap}. Kept name for
 * callers; enforces the $5 spend cap (not Δ = $0).
 */
export async function assertOpenRouterUsageUnchanged(
  input: OpenRouterUsageDeltaInput,
): Promise<OpenRouterUsageDeltaResult> {
  return assertOpenRouterUsageWithinCap(input);
}

/** Throw if post-run usage exceeds / approaches the spend cap. */
export async function enforceOpenRouterUsageUnchanged(
  input: OpenRouterUsageDeltaInput,
): Promise<OpenRouterUsageDeltaResult> {
  const result = await assertOpenRouterUsageWithinCap(input);
  if (!result.ok) {
    throw new Error(result.reason ?? 'OpenRouter spend lock: usage delta aborted');
  }
  return result;
}
