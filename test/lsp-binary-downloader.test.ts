import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  downloadPinnedBinaryWithInternals,
  MAX_BINARY_BYTES,
  MAX_BINARY_REDIRECTS,
} from '../src/core/lsp/binary-downloader-internal';
import { downloadPinnedBinary } from '../src/core/lsp/binary-downloader';

/**
 * Local fixture server. The guard only speaks https to public addresses, so the
 * test-only internals allow plain http on loopback — the same seam pattern the
 * SSRF-guarded fetch uses.
 */
let server: Server;
let origin: string;

const PAYLOAD = Buffer.from('binary-payload-bytes');

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '/';

    if (url === '/ok') {
      res.writeHead(200, { 'Content-Length': String(PAYLOAD.length) });
      res.end(PAYLOAD);
      return;
    }

    // /hop/N redirects until N reaches zero, then serves the payload.
    const hop = /^\/hop\/(\d+)$/.exec(url);
    if (hop) {
      const remaining = Number(hop[1]);
      if (remaining === 0) {
        res.writeHead(200, { 'Content-Length': String(PAYLOAD.length) });
        res.end(PAYLOAD);
        return;
      }
      res.writeHead(302, { Location: `/hop/${remaining - 1}` });
      res.end();
      return;
    }

    if (url === '/no-location') {
      res.writeHead(302);
      res.end();
      return;
    }

    if (url === '/bad-location') {
      res.writeHead(302, { Location: 'http://%%%' });
      res.end();
      return;
    }

    if (url === '/to-private') {
      res.writeHead(302, { Location: 'https://private.example.com/server.tar.gz' });
      res.end();
      return;
    }

    if (url === '/to-floating') {
      res.writeHead(302, { Location: 'https://example.com/releases/latest/server.tar.gz' });
      res.end();
      return;
    }

    if (url === '/not-found') {
      res.writeHead(404);
      res.end('nope');
      return;
    }

    if (url === '/server-error') {
      res.writeHead(500);
      res.end('boom');
      return;
    }

    if (url === '/oversized-content-length') {
      res.writeHead(200, { 'Content-Length': String(MAX_BINARY_BYTES + 1) });
      res.end();
      return;
    }

    // No Content-Length: the cap can only be enforced while reading.
    if (url === '/chunked-too-big') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      const chunk = Buffer.alloc(64 * 1024, 0x61);
      let sent = 0;
      const pump = (): void => {
        while (sent < 4 * 1024 * 1024) {
          if (res.destroyed) return;
          sent += chunk.length;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        res.end();
      };
      pump();
      return;
    }

    if (url === '/truncated') {
      res.writeHead(200, { 'Content-Length': String(PAYLOAD.length + 10) });
      res.end(PAYLOAD);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Test-only seam: plain http against the loopback fixture server. */
const local = { allowLoopback: true, allowInsecureTransport: true } as const;

describe('lsp binary downloader — happy path', () => {
  test('streams the body and returns the exact bytes', async () => {
    const bytes = await downloadPinnedBinaryWithInternals(`${origin}/ok`, local);

    expect(Buffer.from(bytes).equals(PAYLOAD)).toBe(true);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(PAYLOAD).digest('hex'),
    );
  });
});

describe('lsp binary downloader — redirects', () => {
  for (let hops = 1; hops <= MAX_BINARY_REDIRECTS; hops++) {
    test(`follows ${hops} redirect hop(s)`, async () => {
      const bytes = await downloadPinnedBinaryWithInternals(`${origin}/hop/${hops}`, local);
      expect(Buffer.from(bytes).equals(PAYLOAD)).toBe(true);
    });
  }

  test(`refuses hop ${MAX_BINARY_REDIRECTS + 1}`, async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/hop/${MAX_BINARY_REDIRECTS + 1}`, local),
    ).rejects.toThrow(/too many redirects/i);
  });

  test('rejects a redirect without a Location header', async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/no-location`, local),
    ).rejects.toThrow(/location/i);
  });

  test('rejects a redirect with an unparsable Location header', async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/bad-location`, local),
    ).rejects.toThrow(/location|invalid/i);
  });

  test('validates the redirect target against private addresses', async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/to-private`, {
        ...local,
        resolveAll: async (hostname) =>
          hostname === 'private.example.com'
            ? [{ address: '169.254.169.254', family: 4 }]
            : [{ address: '127.0.0.1', family: 4 }],
      }),
    ).rejects.toThrow(/blocked/i);
  });

  test('applies the pinned-URL policy to redirect targets', async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/to-floating`, local),
    ).rejects.toThrow(/version-pinned/i);
  });
});

describe('lsp binary downloader — rejected responses', () => {
  for (const path of ['/not-found', '/server-error']) {
    test(`rejects a non-2xx response from ${path}`, async () => {
      await expect(
        downloadPinnedBinaryWithInternals(`${origin}${path}`, local),
      ).rejects.toThrow(/HTTP \d{3}/);
    });
  }

  test('rejects an oversized Content-Length before reading the body', async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/oversized-content-length`, local),
    ).rejects.toThrow(/exceeds/i);
  });

  test('cuts off a chunked body that grows past the cap', async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/chunked-too-big`, {
        ...local,
        maxBytes: 1024 * 1024,
      }),
    ).rejects.toThrow(/exceeds/i);
  });

  test('rejects a body truncated below its declared length', async () => {
    await expect(
      downloadPinnedBinaryWithInternals(`${origin}/truncated`, local),
    ).rejects.toThrow(/declared|closed/i);
  });
});

describe('lsp binary downloader — transport policy', () => {
  test('rejects plain http without the test-only seam', async () => {
    await expect(downloadPinnedBinaryWithInternals(`${origin}/ok`, {})).rejects.toThrow(
      /https/i,
    );
  });

  test('rejects credentials embedded in the URL', async () => {
    await expect(
      downloadPinnedBinaryWithInternals('https://user:pass@example.com/v1/server.tar.gz', {}),
    ).rejects.toThrow(/credential/i);
  });

  test('rejects a floating (unpinned) URL', async () => {
    await expect(
      downloadPinnedBinaryWithInternals('https://example.com/latest/server.tar.gz', {}),
    ).rejects.toThrow(/version-pinned/i);
  });

  test('the production surface accepts no internals, so http stays refused', async () => {
    await expect(
      (downloadPinnedBinary as (url: string, internals?: unknown) => Promise<Uint8Array>)(
        `${origin}/ok`,
        local,
      ),
    ).rejects.toThrow(/https/i);
  });
});
