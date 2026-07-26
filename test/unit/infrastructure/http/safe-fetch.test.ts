import { describe, expect, test } from 'bun:test';
import { delay, safeFetch } from '../../../../src/infrastructure/http/safe-fetch';

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

    test('rejects private/loopback IP literals', async () => {
      await expect(safeFetch('http://127.0.0.1/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://10.0.0.1/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://192.168.1.1/')).rejects.toThrow(/SSRF blocked/);
      await expect(safeFetch('http://169.254.1.1/')).rejects.toThrow(/SSRF blocked/);
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
