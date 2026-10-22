/**
 * Verify OpenRouter model pricing for the cheap baseline.
 * `:free` must list prompt+completion at 0; paid models must be listed with
 * finite prices and advertise tools / tool_choice (Arturo 22 Oct).
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
  /** True when the catalog advertises tools / tool_choice. */
  supportsTools?: boolean;
  /** True when modelId ends with `:free`. */
  isFree?: boolean;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function modelSupportsTools(match: Record<string, unknown>): boolean {
  const params = match.supported_parameters;
  if (!Array.isArray(params)) return false;
  return params.some((p) => /tool/i.test(String(p)));
}

/**
 * Confirm the model is listed on OpenRouter with usable pricing.
 * - `:free` → prompt+completion must be 0
 * - paid → finite ≥ 0 prices + tools/tool_choice required
 * Never logs the API key.
 */
export async function assertOpenRouterModelFreeZeroPrice(
  modelId: string,
  options: {
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
    /** When true (default for paid), require tools / tool_choice. */
    requireTools?: boolean;
  } = {},
): Promise<FreeModelCheck> {
  const trimmed = modelId.trim();
  const isFree = trimmed.endsWith(':free');
  const requireTools = options.requireTools ?? !isFree;

  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? null;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'OPENROUTER_API_KEY missing — cannot verify model pricing',
      modelId: trimmed,
      pricing: null,
      isFree,
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
      isFree,
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
      isFree,
    };
  }

  const pricingRaw = match.pricing as Record<string, unknown> | undefined;
  const prompt = asNumber(pricingRaw?.prompt);
  const completion = asNumber(pricingRaw?.completion);
  const pricing = { prompt, completion };
  const supportsTools = modelSupportsTools(match);

  if (isFree) {
    if (prompt !== 0 || completion !== 0) {
      return {
        ok: false,
        reason: `model ${trimmed} pricing not zero (prompt=${prompt}, completion=${completion})`,
        modelId: trimmed,
        pricing,
        supportsTools,
        isFree,
      };
    }
  } else {
    if (prompt === null || completion === null || prompt < 0 || completion < 0) {
      return {
        ok: false,
        reason: `model ${trimmed} pricing incomplete (prompt=${prompt}, completion=${completion})`,
        modelId: trimmed,
        pricing,
        supportsTools,
        isFree,
      };
    }
    if (requireTools && !supportsTools) {
      return {
        ok: false,
        reason: `model ${trimmed} does not advertise tools/tool_choice in supported_parameters`,
        modelId: trimmed,
        pricing,
        supportsTools,
        isFree,
      };
    }
  }

  return {
    ok: true,
    reason: null,
    modelId: trimmed,
    pricing,
    supportsTools,
    isFree,
  };
}

/**
 * Public catalog check (no API key, outside the request proxy).
 * Used when Claude Code rejects a model id — confirm whether OpenRouter still
 * lists it as `:free` before stopping. Does not pick a replacement model.
 */
export async function openRouterFreeModelStillListed(
  modelId: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ listed: boolean; freeListed: boolean; httpStatus: number | null; reason: string }> {
  const trimmed = modelId.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    return {
      listed: false,
      freeListed: false,
      httpStatus: null,
      reason: `OpenRouter /api/v1/models unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!res.ok) {
    return {
      listed: false,
      freeListed: false,
      httpStatus: res.status,
      reason: `OpenRouter /api/v1/models failed: HTTP ${res.status}`,
    };
  }
  const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
  const models = Array.isArray(body.data) ? body.data : [];
  const match = models.find((m) => m.id === trimmed);
  if (!match) {
    return {
      listed: false,
      freeListed: false,
      httpStatus: res.status,
      reason: `model ${trimmed} not in OpenRouter public /api/v1/models`,
    };
  }
  const freeListed = trimmed.endsWith(':free');
  return {
    listed: true,
    freeListed,
    httpStatus: res.status,
    reason: freeListed
      ? `model ${trimmed} still listed as :free on OpenRouter`
      : `model ${trimmed} listed but is not a :free id`,
  };
}
