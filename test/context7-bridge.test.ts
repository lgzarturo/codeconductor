import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import {
  createContext7Bridge,
  Context7Error,
  Context7LibrarySchema,
  Context7DocResultSchema,
  resolveContext7BaseUrl,
  DEFAULT_CONTEXT7_BASE_URL,
  type Context7Library,
  type Context7BridgeConfig,
} from '../src/core/mcp/context7-bridge';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = mock(handler) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = ORIGINAL_FETCH;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, statusText: string): Response {
  return new Response('Not Found', { status, statusText });
}

// ─── Test data ────────────────────────────────────────────────────────────────

const MOCK_LIBRARY: Context7Library = {
  libraryId: '/vercel/next.js',
  name: 'Next.js',
  description: 'The React Framework',
  codeSnippets: 4200,
  sourceReputation: 'High',
  benchmarkScore: 98,
  versions: ['v14.3.0', 'v14.2.0'],
};

const MOCK_RESOLVE_RESPONSE = { libraries: [MOCK_LIBRARY] };

const MOCK_DOC_RESULT = {
  libraryId: '/vercel/next.js',
  query: 'How to set up authentication',
  content: '# Authentication\n\nUse NextAuth.js for authentication...',
  sourceUrl: 'https://nextjs.org/docs/authentication',
};

const MOCK_QUERY_RESPONSE = MOCK_DOC_RESULT;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createContext7Bridge', () => {
  afterEach(() => {
    restoreFetch();
  });

  test('throws Context7Error when API key is missing', () => {
    delete process.env.CONTEXT7_API_KEY;
    expect(() => createContext7Bridge()).toThrow(Context7Error);
    expect(() => createContext7Bridge()).toThrow('CONTEXT7_API_KEY is required');
  });

  test('uses config apiKey over env', () => {
    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    expect(bridge.resolveLibraryId).toBeDefined();
    expect(bridge.queryDocs).toBeDefined();
  });

  test('uses env CONTEXT7_API_KEY when no config provided', () => {
    process.env.CONTEXT7_API_KEY = 'env-key';
    const bridge = createContext7Bridge();
    expect(bridge.resolveLibraryId).toBeDefined();
    delete process.env.CONTEXT7_API_KEY;
  });

  test('rejects a non-https or non-allowlisted baseUrl before fetch', () => {
    expect(() => createContext7Bridge({ apiKey: 'k', baseUrl: 'http://127.0.0.1/v1' })).toThrow(
      Context7Error
    );
    expect(() =>
      createContext7Bridge({ apiKey: 'k', baseUrl: 'https://evil.example/v1' })
    ).toThrow(/api.context7.com/);
  });
});

describe('resolveContext7BaseUrl', () => {
  test('pins the official origin', () => {
    expect(resolveContext7BaseUrl(DEFAULT_CONTEXT7_BASE_URL)).toBe(
      'https://api.context7.com/v1'
    );
    expect(resolveContext7BaseUrl('https://api.context7.com/v1/')).toBe(
      'https://api.context7.com/v1'
    );
  });

  test('rejects credentials in the URL', () => {
    expect(() =>
      resolveContext7BaseUrl('https://user:pass@api.context7.com/v1')
    ).toThrow(/credentials/);
  });
});

describe('resolveLibraryId', () => {
  afterEach(() => {
    restoreFetch();
  });

  test('returns parsed libraries on success', async () => {
    mockFetch((_url, _init) => jsonResponse(MOCK_RESOLVE_RESPONSE));

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.resolveLibraryId('react testing', 'React');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].libraryId).toBe('/vercel/next.js');
      expect(result.data[0].name).toBe('Next.js');
      expect(result.data[0].sourceReputation).toBe('High');
    }
  });

  test('sends correct request body and headers', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    mockFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(MOCK_RESOLVE_RESPONSE);
    });

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    await bridge.resolveLibraryId('react hooks', 'react');

    expect(capturedUrl).toBe('https://api.context7.com/v1/resolve-library-id');
    expect(capturedInit?.headers).toHaveProperty('Authorization', 'Bearer test-key');
    const body = JSON.parse(capturedInit?.body as string);
    expect(body).toEqual({ query: 'react hooks', libraryName: 'react' });
  });

  test('returns err on network failure', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.resolveLibraryId('react', 'react');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Context7Error);
      expect(result.error.code).toBe('NETWORK_ERROR');
    }
  });

  test('returns err on non-2xx response', async () => {
    mockFetch((_url, _init) => errorResponse(404, 'Not Found'));

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.resolveLibraryId('unknown-lib', 'unknown');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Context7Error);
      expect(result.error.code).toBe('API_ERROR');
    }
  });

  test('returns err on invalid response schema', async () => {
    mockFetch((_url, _init) =>
      jsonResponse({ libraries: [{ libraryId: 123, name: true }] }),
    );

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.resolveLibraryId('react', 'react');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SCHEMA_ERROR');
    }
  });

  test('returns multiple libraries', async () => {
    mockFetch((_url, _init) =>
      jsonResponse({ libraries: [MOCK_LIBRARY, { ...MOCK_LIBRARY, libraryId: '/facebook/react', name: 'React' }] }),
    );

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.resolveLibraryId('react', 'react');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });
});

describe('queryDocs', () => {
  afterEach(() => {
    restoreFetch();
  });

  test('returns doc result on success', async () => {
    mockFetch((_url, _init) => jsonResponse(MOCK_QUERY_RESPONSE));

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.queryDocs('/vercel/next.js', 'authentication');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.libraryId).toBe('/vercel/next.js');
      expect(result.data.query).toBe('How to set up authentication');
      expect(result.data.content).toContain('Authentication');
      expect(result.data.sourceUrl).toBe('https://nextjs.org/docs/authentication');
    }
  });

  test('sends correct request body', async () => {
    let capturedInit: RequestInit | undefined;
    mockFetch((_url, init) => {
      capturedInit = init;
      return jsonResponse(MOCK_QUERY_RESPONSE);
    });

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    await bridge.queryDocs('/vercel/next.js', 'routing');

    const body = JSON.parse(capturedInit?.body as string);
    expect(body).toEqual({ libraryId: '/vercel/next.js', query: 'routing' });
  });

  test('returns err on network failure', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.queryDocs('/vercel/next.js', 'auth');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NETWORK_ERROR');
    }
  });

  test('returns err on non-2xx response', async () => {
    mockFetch((_url, _init) => errorResponse(500, 'Internal Server Error'));

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.queryDocs('/vercel/next.js', 'auth');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('API_ERROR');
    }
  });

  test('handles response without sourceUrl', async () => {
    const noUrlResponse = { ...MOCK_DOC_RESULT, sourceUrl: undefined };
    mockFetch((_url, _init) => jsonResponse(noUrlResponse));

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.queryDocs('/vercel/next.js', 'auth');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceUrl).toBeUndefined();
    }
  });

  test('returns err on invalid response schema', async () => {
    mockFetch((_url, _init) =>
      jsonResponse({ libraryId: 123, query: true, content: [] }),
    );

    const bridge = createContext7Bridge({ apiKey: 'test-key' });
    const result = await bridge.queryDocs('/vercel/next.js', 'auth');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SCHEMA_ERROR');
    }
  });
});
