/**
 * Zero-spend lock for OpenRouter cheap/free mode (Arturo).
 * Reusable by M5 bench: abort before the first call when the run could spend.
 *
 * Rules:
 * 1. modelId must end with `:free`.
 * 2. When /api/v1/key is available, abort if a paid limit or paid balance > 0.
 * API keys are read only from the environment — never from files.
 */

export interface OpenRouterKeySnapshot {
  /** Credit/usage limit on the key (USD). null = unlimited / unset. */
  limit: number | null;
  /** Remaining credit against limit, when present. */
  limitRemaining: number | null;
  /** Lifetime or period usage in USD, when present. */
  usage: number | null;
  /** True when OpenRouter reports the key as free-tier. */
  isFreeTier: boolean | null;
  /** Raw label for diagnostics (never a secret). */
  label: string | null;
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

export function isOpenRouterFreeModel(modelId: string): boolean {
  return modelId.trim().toLowerCase().endsWith(':free');
}

/**
 * Evaluate whether a paid spend path is open on the key.
 * Paid limit > 0 or positive remaining paid balance ⇒ not zero-spend.
 */
export function keyAllowsPaidSpend(key: OpenRouterKeySnapshot): boolean {
  if (key.isFreeTier === false) return true;
  if (typeof key.limit === 'number' && key.limit > 0) return true;
  if (typeof key.limitRemaining === 'number' && key.limitRemaining > 0 && key.limit !== null) {
    return true;
  }
  return false;
}

export function readOpenRouterApiKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.OPENROUTER_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/**
 * GET /api/v1/key using the env key. Never logs or returns the key itself.
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
  const body = (await res.json()) as {
    data?: {
      limit?: number | null;
      limit_remaining?: number | null;
      usage?: number | null;
      is_free_tier?: boolean;
      label?: string;
    };
  };
  const data = body.data ?? {};
  return {
    limit: typeof data.limit === 'number' ? data.limit : data.limit === null ? null : null,
    limitRemaining:
      typeof data.limit_remaining === 'number'
        ? data.limit_remaining
        : data.limit_remaining === null
          ? null
          : null,
    usage: typeof data.usage === 'number' ? data.usage : null,
    isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
    label: typeof data.label === 'string' ? data.label : null,
  };
}

/**
 * Abort-before-call gate for OpenRouter zero-spend mode.
 * Returns `{ ok: false, reason }` instead of throwing so callers can format errors.
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

  if (keyAllowsPaidSpend(key)) {
    return {
      ok: false,
      reason:
        'OpenRouter zero-spend lock: /api/v1/key reports a paid limit or non-free tier (limit/balance > 0)',
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
