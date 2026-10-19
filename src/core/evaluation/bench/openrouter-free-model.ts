/**
 * Verify an OpenRouter model is `:free` with list price 0 (prompt + completion).
 * Used by the cheap baseline before any host call.
 */

export interface OpenRouterModelPricing {
  prompt: number | null;
  completion: number | null;
}

export interface FreeModelCheck {
  ok: boolean;
  reason: string | null;
  modelId: string;
  pricing: OpenRouterModelPricing | null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Confirm modelId ends with `:free` and OpenRouter lists prompt+completion at 0.
 * Never logs the API key.
 */
export async function assertOpenRouterModelFreeZeroPrice(
  modelId: string,
  options: {
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<FreeModelCheck> {
  const trimmed = modelId.trim();
  if (!trimmed.endsWith(':free')) {
    return {
      ok: false,
      reason: `model ${trimmed} is not a :free OpenRouter model`,
      modelId: trimmed,
      pricing: null,
    };
  }

  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? null;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'OPENROUTER_API_KEY missing — cannot verify model pricing',
      modelId: trimmed,
      pricing: null,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    return {
      ok: false,
      reason: `OpenRouter /api/v1/models failed: HTTP ${res.status}`,
      modelId: trimmed,
      pricing: null,
    };
  }

  const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const models = Array.isArray(body.data) ? body.data : [];
  const match = models.find((m) => m.id === trimmed);
  if (!match) {
    return {
      ok: false,
      reason: `model ${trimmed} not found in /api/v1/models`,
      modelId: trimmed,
      pricing: null,
    };
  }

  const pricingRaw = match.pricing as Record<string, unknown> | undefined;
  const prompt = asNumber(pricingRaw?.prompt);
  const completion = asNumber(pricingRaw?.completion);
  const pricing = { prompt, completion };
  if (prompt !== 0 || completion !== 0) {
    return {
      ok: false,
      reason: `model ${trimmed} pricing not zero (prompt=${prompt}, completion=${completion})`,
      modelId: trimmed,
      pricing,
    };
  }

  return { ok: true, reason: null, modelId: trimmed, pricing };
}
