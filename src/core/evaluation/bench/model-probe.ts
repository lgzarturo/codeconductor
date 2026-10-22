/**
 * One-shot model probe through the fail-closed OpenRouter request proxy.
 * Counts as exactly one reserved hop when the proxy forwards.
 */
import { sanitizeStderr } from './host-claude';

export interface ModelProbeResult {
  ok: boolean;
  httpStatus: number | null;
  /** Sanitized upstream / API error excerpt (no keys / session / paths). */
  errorTruncated: string | null;
  reason: string;
}

/**
 * POST /v1/messages via `anthropicBaseUrl` (proxy) with the local token.
 * Does not print secrets. Body is a minimal non-tool "ping".
 */
export async function probeModelViaProxy(input: {
  modelId: string;
  anthropicBaseUrl: string;
  localAuthToken: string;
  fetchImpl?: typeof fetch;
}): Promise<ModelProbeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = `${input.anthropicBaseUrl.replace(/\/$/, '')}/v1/messages`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${input.localAuthToken}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.modelId,
        max_tokens: 16,
        stream: false,
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: null,
      errorTruncated: null,
      reason: `probe fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const rawText = await res.text().catch(() => '');
  const scrubbed = sanitizeStderr(rawText, 500);
  if (!res.ok) {
    return {
      ok: false,
      httpStatus: res.status,
      errorTruncated: scrubbed || null,
      reason: `probe HTTP ${res.status}`,
    };
  }

  // Anthropic error objects sometimes arrive with HTTP 200 + type=error.
  try {
    const body = JSON.parse(rawText) as {
      type?: string;
      error?: { message?: string; type?: string };
      content?: unknown;
    };
    if (body.type === 'error' || body.error) {
      const msg = body.error?.message ?? scrubbed ?? 'upstream error object';
      return {
        ok: false,
        httpStatus: res.status,
        errorTruncated: sanitizeStderr(String(msg), 500),
        reason: `probe upstream error: ${body.error?.type ?? body.type ?? 'error'}`,
      };
    }
  } catch {
    // non-JSON success body still counts as ok if HTTP 2xx
  }

  return {
    ok: true,
    httpStatus: res.status,
    errorTruncated: null,
    reason: 'probe ok',
  };
}
