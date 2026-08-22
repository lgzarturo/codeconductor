import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import * as publicSafeFetchModule from '../../../../src/infrastructure/http/safe-fetch';
import { safeFetch } from '../../../../src/infrastructure/http/safe-fetch';
import {
  createPinnedLookup,
  delay,
  isBlockedAddress,
  safeFetchWithInternals,
} from '../../../../src/infrastructure/http/safe-fetch-internal';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

let server: Server;
let origin: string;
let port: number;
let resolveSlowRequestClosed: (() => void) | undefined;
let requestCount = 0;

function requestPath(url: string | undefined): string {
  return url ?? '';
}

beforeAll(async () => {
  server = createServer((req, res) => {
    requestCount++;
    const path = requestPath(req.url);

    if (path === '/ok') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('OK BODY');
      return;
    }

    if (path === '/echo-headers') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.headers));
      return;
    }

    if (path === '/rel') {
      res.writeHead(302, { location: '/final?x=1' });
      res.end();
      return;
    }

    if (path === '/redirect-with-body') {
      res.writeHead(302, {
        location: '/final?from=body',
        'content-type': 'text/plain',
      });
      res.end('REDIRECT BODY');
      return;
    }

    if (path === '/redirect-hanging-body') {
      res.writeHead(302, { location: '/final?from=hanging' });
      res.write('ignored redirect body');
      return;
    }

    if (path.startsWith('/final')) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('FINAL');
      return;
    }

    if (path.startsWith('/hop/')) {
      const n = Number(path.slice('/hop/'.length));
      res.writeHead(302, { location: `/hop/${n + 1}` });
      res.end();
      return;
    }

    if (path.startsWith('/slow-hop/')) {
      const n = Number(path.slice('/slow-hop/'.length));
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(302, { location: `/slow-hop/${n + 1}` });
        res.end();
      }, 80);
      return;
    }

    if (path === '/to-ftp') {
      res.writeHead(302, { location: 'ftp://example.com/file' });
      res.end();
      return;
    }

    if (path === '/to-metadata') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      res.end();
      return;
    }

    if (path === '/slow') {
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('LATE');
      }, 5_000).unref?.();
      return;
    }

    if (path === '/slow-cleanup') {
      req.on('close', () => resolveSlowRequestClosed?.());
      return;
    }

    if (path === '/premature-close') {
      res.writeHead(200, { 'content-length': '20' });
      res.write('short');
      setImmediate(() => res.destroy());
      return;
    }

    if (path === '/oversized-content-length') {
      res.writeHead(200, {
        'content-type': 'text/plain',
        'content-length': String(MAX_BODY_BYTES + 1),
      });
      res.write('a');
      return;
    }

    if (path === '/chunked-too-big') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      const chunk = Buffer.alloc(256 * 1024, 0x61);
      let sent = 0;
      const pump = (): void => {
        while (sent < MAX_BODY_BYTES + 2 * 1024 * 1024) {
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

    if (path === '/exactly-limit') {
      res.writeHead(200, {
        'content-type': 'text/plain',
        'content-length': String(MAX_BODY_BYTES),
      });
      res.end(Buffer.alloc(MAX_BODY_BYTES, 0x62));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('NOT FOUND');
  });

  server.on('clientError', () => {
    /* client aborts are expected in limit tests */
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.closeAllConnections?.();
  server.close();
});

const loopback = { allowLoopback: true } as const;
const IPV4_TRANSLATABLE_PRIVATE = [
  '::ffff:0:127.0.0.1',
  '::ffff:0:10.0.0.1',
  '::ffff:0:169.254.169.254',
] as const;

async function fetchRawResponse(headers: string): Promise<void> {
  const rawServer = createNetServer((socket) => {
    socket.end(`HTTP/1.1 200 OK\r\n${headers}\r\nConnection: close\r\n\r\nx`);
  });
  await new Promise<void>((resolve) => rawServer.listen(0, '127.0.0.1', resolve));
  const rawPort = (rawServer.address() as AddressInfo).port;
  try {
    await safeFetchWithInternals(`http://127.0.0.1:${rawPort}/`, {}, loopback);
  } finally {
    rawServer.close();
  }
}

describe('infrastructure/http/safe-fetch', () => {
  describe('validateUrl (via safeFetch) — SSRF guard', () => {
    test('rejects a malformed URL', async () => {
      await expect(safeFetch('not a url')).rejects.toThrow(/Invalid URL/);
    });

    test('rejects non-http(s) schemes', async () => {
      await expect(safeFetch('ftp://example.com/file')).rejects.toThrow(/Blocked scheme/);
      await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/Blocked scheme/);
    });

    test('rejects localhost and *.localhost hostnames', async () => {
      await expect(safeFetch('http://localhost/')).rejects.toThrow(/Blocked hostname/);
      await expect(safeFetch('http://api.localhost/')).rejects.toThrow(/Blocked hostname/);
    });

    test('rejects localhost with a trailing dot', async () => {
      await expect(safeFetch('http://localhost./')).rejects.toThrow(/Blocked hostname/);
      await expect(safeFetch('http://api.localhost./')).rejects.toThrow(/Blocked hostname/);
    });

    test('rejects URLs carrying credentials', async () => {
      await expect(safeFetch('http://user:pass@example.com/')).rejects.toThrow(/credentials/i);
      await expect(safeFetch('https://user@example.com/')).rejects.toThrow(/credentials/i);
    });

    test('rejects private/loopback IP literals', async () => {
      await expect(safeFetch('http://127.0.0.1/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://10.0.0.1/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://192.168.1.1/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://169.254.1.1/')).rejects.toThrow(/SSRF blocked/);
    });

    test('rejects IPv6 loopback and unique-local literals', async () => {
      await expect(safeFetch('http://[::1]/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://[fd00::1]/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://[fe80::1]/')).rejects.toThrow(/SSRF blocked/);
    });

    test('rejects IPv4-mapped IPv6 literals wrapping a private address', async () => {
      await expect(safeFetch('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://[::ffff:a00:1]/')).rejects.toThrow(/SSRF blocked/);
    });

    test.each(IPV4_TRANSLATABLE_PRIVATE)(
      'rejects IPv4-translatable IPv6 literal %s',
      async (address) => {
        await expect(
          safeFetch(`http://[${address}]/`, { timeout: 200 })
        ).rejects.toThrow(/SSRF blocked/);
      }
    );

    test('blocks when any resolved DNS address is private', async () => {
      await expect(
        safeFetchWithInternals('http://mixed.example.com/', {}, {
          resolveAll: async () => [
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.5', family: 4 },
          ],
        })
      ).rejects.toThrow(/SSRF blocked/);
    });

    test('does not let the loopback test seam allow other private ranges', async () => {
      await expect(
        safeFetchWithInternals('http://private.example.com/', {}, {
          allowLoopback: true,
          resolveAll: async () => [{ address: '10.0.0.5', family: 4 }],
        })
      ).rejects.toThrow(/SSRF blocked/);
    });

    test.each(IPV4_TRANSLATABLE_PRIVATE)(
      'blocks DNS answer using IPv4-translatable IPv6 %s',
      async (address) => {
        const before = requestCount;
        await expect(
          safeFetchWithInternals(
            `http://translated.example.com:${port}/ok`,
            { timeout: 200 },
            { resolveAll: async () => [{ address, family: 6 }] }
          )
        ).rejects.toThrow(/SSRF blocked/);
        expect(requestCount).toBe(before);
      }
    );

    test.each([
      '64:ff9b::7f00:1',
      '64:ff9b::a00:1',
      '64:ff9b::a9fe:a9fe',
      '64:ff9b:1::1',
    ])('blocks the NAT64 translation address %s', (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    });

    test.each(['http://2130706433/', 'http://0x7f000001/', 'http://017700000001/'])(
      'rejects alternate IPv4 literal notation %s',
      async (url) => {
        await expect(safeFetch(url)).rejects.toThrow(/SSRF blocked/);
      }
    );

    test('rejects hostnames that resolve to no address', async () => {
      await expect(
        safeFetchWithInternals('http://empty.example.com/', {}, { resolveAll: async () => [] })
      ).rejects.toThrow(/DNS/i);
    });

    test.each([
      { address: '127.0.0.1', family: 6 },
      { address: '::1', family: 4 },
    ])('fails closed when DNS returns $address with family $family', async ({ address, family }) => {
      const before = requestCount;
      await expect(
        safeFetchWithInternals(`http://family-mismatch.example.com:${port}/ok`, {}, {
          allowLoopback: true,
          resolveAll: async () => [{ address, family }],
        })
      ).rejects.toThrow(/family/i);
      expect(requestCount).toBe(before);
    });
  });

  describe('public API', () => {
    test('does not export internal address and lookup helpers', () => {
      expect(publicSafeFetchModule).not.toHaveProperty('isBlockedAddress');
      expect(publicSafeFetchModule).not.toHaveProperty('createPinnedLookup');
    });

    test('drops a cast third-arg bypass so allowLoopback cannot reach loopback', async () => {
      const before = requestCount;
      const bypass = safeFetch as unknown as (
        url: string,
        options?: object,
        internals?: object
      ) => ReturnType<typeof safeFetch>;

      await expect(
        bypass(`${origin}/ok`, {}, {
          allowLoopback: true,
          resolveAll: async () => [{ address: '127.0.0.1', family: 4 }],
        })
      ).rejects.toThrow(/SSRF blocked/);
      expect(requestCount).toBe(before);
    });
  });

  describe('isBlockedAddress — fail-closed classifier', () => {
    test.each(IPV4_TRANSLATABLE_PRIVATE)(
      'blocks IPv4-translatable IPv6 address %s',
      (address) => {
        expect(isBlockedAddress(address)).toBe(true);
      }
    );

    test.each([
      '0.0.0.0',
      '127.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '192.0.0.1',
      '192.0.2.1',
      '198.18.0.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '240.0.0.1',
      '255.255.255.255',
    ])('blocks IPv4 %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });

    test.each([
      '::',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1234',
      'fec0::1',
      'ff02::1',
      '2001:db8::1',
      '100::1',
      '::ffff:127.0.0.1',
      '::ffff:192.168.0.1',
    ])('blocks IPv6 %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });

    test.each([
      'not-an-ip',
      '',
      '10.0.0',
      '999.1.1.1',
      '01.2.3.4',
      'fg80::1',
      '1:2:3:4:5:6:7::8',
    ])(
      'fails closed on unparsable address %p',
      (ip) => {
        expect(isBlockedAddress(ip)).toBe(true);
      }
    );

    test.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:2800:220:1::248'])(
      'allows public address %s',
      (ip) => {
        expect(isBlockedAddress(ip)).toBe(false);
      }
    );
  });

  describe('createPinnedLookup', () => {
    test('returns the pinned address regardless of the hostname asked', () => {
      const lookup = createPinnedLookup('93.184.216.34', 4);
      let seen: unknown[] = [];
      lookup('evil.example.com', { all: false }, (...args: unknown[]) => {
        seen = args;
      });
      expect(seen[0]).toBeNull();
      expect(seen[1]).toBe('93.184.216.34');
      expect(seen[2]).toBe(4);
    });

    test('supports the all:true callback shape', () => {
      const lookup = createPinnedLookup('2606:2800:220:1::248', 6);
      let seen: unknown[] = [];
      lookup('evil.example.com', { all: true }, (...args: unknown[]) => {
        seen = args;
      });
      expect(seen[0]).toBeNull();
      expect(seen[1]).toEqual([{ address: '2606:2800:220:1::248', family: 6 }]);
    });
  });

  describe('transport', () => {
    test('returns status, headers, body and the original input url', async () => {
      const response = await safeFetchWithInternals(`${origin}/ok`, {}, loopback);
      expect(response.status).toBe(200);
      expect(response.body).toBe('OK BODY');
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.url).toBe(`${origin}/ok`);
      expect(response.responseTime).toBeGreaterThanOrEqual(0);
    });

    test('sends identity accept-encoding and the original Host header', async () => {
      const response = await safeFetchWithInternals(`${origin}/echo-headers`, {}, loopback);
      const headers = JSON.parse(response.body) as Record<string, string>;
      expect(headers['accept-encoding']).toBe('identity');
      expect(headers.host).toBe(`127.0.0.1:${port}`);
    });

    test('pins the connection to the resolved address while keeping the original Host', async () => {
      const response = await safeFetchWithInternals(
        `http://pinned.example.com:${port}/echo-headers`,
        {},
        {
          allowLoopback: true,
          resolveAll: async () => [{ address: '127.0.0.1', family: 4 }],
        }
      );
      const headers = JSON.parse(response.body) as Record<string, string>;
      expect(headers.host).toBe(`pinned.example.com:${port}`);
    });
  });

  describe('redirects', () => {
    test('returns the first 3xx response when followRedirects is false', async () => {
      const response = await safeFetchWithInternals(
        `${origin}/rel`,
        { followRedirects: false },
        loopback
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/final?x=1');
    });

    test('preserves the first 3xx body when followRedirects is false', async () => {
      const response = await safeFetchWithInternals(
        `${origin}/redirect-with-body`,
        { followRedirects: false },
        loopback
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/final?from=body');
      expect(response.body).toBe('REDIRECT BODY');
    });

    test('resolves a relative Location when followRedirects is true', async () => {
      const response = await safeFetchWithInternals(
        `${origin}/rel`,
        { followRedirects: true },
        loopback
      );
      expect(response.status).toBe(200);
      expect(response.body).toBe('FINAL');
      expect(response.url).toBe(`${origin}/rel`);
    });

    test('rejects after more than 5 redirects', async () => {
      await expect(
        safeFetchWithInternals(`${origin}/hop/1`, { followRedirects: true }, loopback)
      ).rejects.toThrow(/redirect/i);
    });

    test('revalidates the scheme on every redirect hop', async () => {
      await expect(
        safeFetchWithInternals(`${origin}/to-ftp`, { followRedirects: true }, loopback)
      ).rejects.toThrow(/Blocked scheme/);
    });

    test('revalidates the address on every redirect hop', async () => {
      await expect(
        safeFetchWithInternals(`${origin}/to-metadata`, { followRedirects: true }, loopback)
      ).rejects.toThrow(/SSRF blocked/);
    });

    test('applies the timeout to the whole redirect chain', async () => {
      await expect(
        safeFetchWithInternals(
          `${origin}/slow-hop/1`,
          { followRedirects: true, timeout: 150 },
          loopback
        )
      ).rejects.toThrow(/timed out/i);
    });

    test('follows a redirect without waiting for or buffering its unfinished body', async () => {
      const response = await safeFetchWithInternals(
        `${origin}/redirect-hanging-body`,
        { followRedirects: true, timeout: 300 },
        loopback
      );
      expect(response.status).toBe(200);
      expect(response.body).toBe('FINAL');
    });
  });

  describe('body limit', () => {
    test('rejects early when content-length exceeds 10 MiB', async () => {
      await expect(
        safeFetchWithInternals(`${origin}/oversized-content-length`, { timeout: 2_000 }, loopback)
      ).rejects.toThrow(/exceeds/i);
    });

    test('aborts a chunked response that grows past 10 MiB', async () => {
      await expect(
        safeFetchWithInternals(`${origin}/chunked-too-big`, { timeout: 5_000 }, loopback)
      ).rejects.toThrow(/exceeds/i);
    });

    test('accepts a body of exactly 10 MiB', async () => {
      const response = await safeFetchWithInternals(
        `${origin}/exactly-limit`,
        { timeout: 5_000 },
        loopback
      );
      expect(response.status).toBe(200);
      expect(Buffer.byteLength(response.body)).toBe(MAX_BODY_BYTES);
    });

    test.each(['content-length: nope', 'content-length: -1'])(
      'rejects a response with invalid framing: %s',
      async (header) => {
        await expect(fetchRawResponse(header)).rejects.toThrow();
      }
    );
  });

  describe('timeout', () => {
    test('rejects when the server does not respond in time', async () => {
      await expect(
        safeFetchWithInternals(`${origin}/slow`, { timeout: 150 }, loopback)
      ).rejects.toThrow(/timed out/i);
    });

    test('destroys the request when the total timeout expires', async () => {
      const requestClosed = new Promise<void>((resolve) => {
        resolveSlowRequestClosed = resolve;
      });

      await expect(
        safeFetchWithInternals(`${origin}/slow-cleanup`, { timeout: 150 }, loopback)
      ).rejects.toThrow(/timed out/i);
      await expect(Promise.race([
        requestClosed.then(() => true),
        delay(1_000).then(() => false),
      ])).resolves.toBe(true);
    });
  });

  describe('response errors', () => {
    test('rejects when the response closes before its declared body completes', async () => {
      await expect(
        safeFetchWithInternals(`${origin}/premature-close`, { timeout: 2_000 }, loopback)
      ).rejects.toThrow();
    });
  });

  describe('delay', () => {
    test('resolves after the given number of milliseconds', async () => {
      const start = Date.now();
      await delay(10);
      expect(Date.now() - start).toBeGreaterThanOrEqual(8);
    });
  });
});
