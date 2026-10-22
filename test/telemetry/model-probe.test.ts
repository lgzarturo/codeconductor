/**
 * Offline model-probe unit tests (no real OpenRouter traffic).
 */
import { describe, expect, test } from 'bun:test';
import { probeModelViaProxy } from '../../src/core/evaluation/bench/model-probe';

describe('probeModelViaProxy', () => {
  test('ok on HTTP 200 JSON without error type', async () => {
    const result = await probeModelViaProxy({
      modelId: 'openai/gpt-oss-20b',
      anthropicBaseUrl: 'http://proxy.test/api',
      localAuthToken: 'cc-proxy-local-test',
      fetchImpl: async () =>
        new Response(JSON.stringify({ type: 'message', content: [] }), {
          status: 200,
        }),
    });
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
  });

  test('fails closed on HTTP 404 with sanitized excerpt', async () => {
    const result = await probeModelViaProxy({
      modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
      anthropicBaseUrl: 'http://proxy.test/api',
      localAuthToken: 'cc-proxy-local-test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              message:
                'Function nvidia/nemotron-3-super-120b-a12b:free Not found Bearer sk-or-v1-secret',
            },
          }),
          { status: 404 },
        ),
    });
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(404);
    expect(result.errorTruncated).not.toContain('sk-or-v1-secret');
  });

  test('fails on HTTP 200 body type=error', async () => {
    const result = await probeModelViaProxy({
      modelId: 'x',
      anthropicBaseUrl: 'http://proxy.test/api',
      localAuthToken: 'cc-proxy-local-test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'not_found_error', message: 'gone' },
          }),
          { status: 200 },
        ),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/upstream error/i);
  });
});
