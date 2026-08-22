import { lookup as dnsLookup } from 'node:dns/promises';
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { SafeFetchOptions, SafeFetchResponse } from '../../domain/seo/seo-types';

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'CodeConductor-SEO/0.3.0';
const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

/**
 * Injectable seams for the test suite only. The production module
 * (`safe-fetch.ts`) re-exports `safeFetch` without this parameter so no
 * production caller can reach it.
 */
export interface SafeFetchInternals {
  readonly resolveAll?: (hostname: string) => Promise<ResolvedAddress[]>;
  readonly allowLoopback?: boolean;
}

/** Errors raised deliberately by the guard; never wrapped as transport failures. */
class SafeFetchError extends Error {}

function parseIpv4(text: string): number | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    if (part.length > 1 && part.startsWith('0')) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function parseHextets(segment: string, allowEmbeddedIpv4: boolean): number[] | undefined {
  if (segment === '') return [];
  const tokens = segment.split(':');
  const groups: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.includes('.')) {
      if (!allowEmbeddedIpv4 || i !== tokens.length - 1) return undefined;
      const embedded = parseIpv4(token);
      if (embedded === undefined) return undefined;
      groups.push((embedded >>> 16) & 0xffff, embedded & 0xffff);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(token)) return undefined;
    groups.push(Number.parseInt(token, 16));
  }
  return groups;
}

function parseIpv6(text: string): number[] | undefined {
  if (text.includes('%')) return undefined;
  const halves = text.split('::');
  if (halves.length > 2) return undefined;

  if (halves.length === 1) {
    const groups = parseHextets(halves[0], true);
    return groups !== undefined && groups.length === 8 ? groups : undefined;
  }

  const head = parseHextets(halves[0], false);
  const tail = parseHextets(halves[1], true);
  if (head === undefined || tail === undefined) return undefined;
  const fill = 8 - head.length - tail.length;
  // "::" must compress at least one group, otherwise the literal is malformed.
  if (fill < 1) return undefined;
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}

const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network" / unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation TEST-NET-1
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation TEST-NET-2
  ['203.0.113.0', 24], // documentation TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

const BLOCKED_IPV4 = BLOCKED_IPV4_CIDRS.map(([base, bits]) => ({
  base: parseIpv4(base) ?? 0,
  mask: bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0,
}));

function isBlockedIpv4(value: number): boolean {
  return BLOCKED_IPV4.some(({ base, mask }) => ((value ^ base) & mask) === 0);
}

function embeddedIpv4(groups: number[]): number {
  return ((groups[6] << 16) | groups[7]) >>> 0;
}

function isBlockedIpv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5] = groups;

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0) {
    const isCompatible = g4 === 0 && g5 === 0; // ::a.b.c.d, plus :: and ::1
    const isMapped = g4 === 0 && g5 === 0xffff; // ::ffff:a.b.c.d
    const isTranslated = g4 === 0xffff && g5 === 0; // ::ffff:0:a.b.c.d (SIIT)

    if (isCompatible || isMapped || isTranslated) {
      // Every embedded form is judged by the IPv4 address it carries.
      const embedded = embeddedIpv4(groups);
      if (isCompatible && (embedded === 0 || embedded === 1)) return true;
      return isBlockedIpv4(embedded);
    }
  }

  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g0 === 0x0064 && g1 === 0xff9b) return true; // 64:ff9b::/32 NAT64 (well-known + local)
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // 2001:db8::/32 documentation
  if (g0 === 0x2001 && (g1 & 0xfe00) === 0) return true; // 2001::/23 protocol assignments
  if (g0 === 0x2002) return true; // 2002::/16 6to4 can wrap private IPv4
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // 100::/64 discard

  return false;
}

/** Fail-closed: an address that cannot be parsed is treated as blocked. */
export function isBlockedAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4 !== undefined) return isBlockedIpv4(ipv4);
  const ipv6 = parseIpv6(address);
  if (ipv6 !== undefined) return isBlockedIpv6(ipv6);
  return true;
}

function addressFamily(address: string): 4 | 6 | undefined {
  if (parseIpv4(address) !== undefined) return 4;
  if (parseIpv6(address) !== undefined) return 6;
  return undefined;
}

export function isLoopbackAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4 !== undefined) return ipv4 >>> 24 === 127;
  const groups = parseIpv6(address);
  if (groups === undefined) return false;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  return mapped && embeddedIpv4(groups) >>> 24 === 127;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number
) => void;

/** Pins the connection to an already validated address, closing the DNS rebinding window. */
export function createPinnedLookup(
  address: string,
  family: 4 | 6
): (hostname: string, options: { all?: boolean } | LookupCallback, callback?: LookupCallback) => void {
  return (_hostname, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    if (done === undefined) return;
    if (typeof options !== 'function' && options?.all === true) {
      done(null, [{ address, family }]);
      return;
    }
    done(null, address, family);
  };
}

interface ValidatedTarget {
  readonly url: URL;
  readonly hostname: string;
  readonly address: string;
  readonly family: 4 | 6;
}

function normalizeHostname(hostname: string): string {
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  while (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

async function resolveAddresses(
  hostname: string,
  internals: SafeFetchInternals
): Promise<ResolvedAddress[]> {
  const literalFamily = addressFamily(hostname);
  if (literalFamily !== undefined) {
    return [{ address: hostname, family: literalFamily }];
  }

  let resolved: ResolvedAddress[];
  try {
    resolved = internals.resolveAll
      ? await internals.resolveAll(hostname)
      : await dnsLookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new SafeFetchError(`DNS resolution failed for ${hostname}: ${String(error)}`);
  }

  if (resolved.length === 0) {
    throw new SafeFetchError(`DNS resolution failed for ${hostname}: no addresses returned`);
  }
  return resolved;
}

async function validateTarget(
  urlString: string,
  internals: SafeFetchInternals
): Promise<ValidatedTarget> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${urlString}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SafeFetchError(`Blocked scheme: ${parsed.protocol}. Only http and https are allowed.`);
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new SafeFetchError(`Blocked URL credentials for ${parsed.hostname}`);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === '' || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new SafeFetchError(`Blocked hostname: ${parsed.hostname}`);
  }

  const addresses = await resolveAddresses(hostname, internals);
  for (const resolved of addresses) {
    const family = addressFamily(resolved.address);
    if (family === undefined || family !== resolved.family) {
      throw new SafeFetchError(
        `DNS family mismatch for ${hostname}: ${resolved.address} reported as family ${resolved.family}`
      );
    }

    const allowed = internals.allowLoopback === true && isLoopbackAddress(resolved.address);
    if (!allowed && isBlockedAddress(resolved.address)) {
      throw new SafeFetchError(
        `SSRF blocked: ${hostname} resolves to blocked IP ${resolved.address}`
      );
    }
  }

  const pinned = addresses[0];
  return {
    url: parsed,
    hostname,
    address: pinned.address,
    family: pinned.family === 6 ? 6 : 4,
  };
}

interface RawResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

function normalizeHeaders(raw: IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

/**
 * Content-Length must be a single decimal integer within the body budget.
 * Returns the declared length, or undefined when the header is absent.
 */
function parseContentLength(raw: string | string[] | undefined, url: string): number | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    throw new SafeFetchError(`Invalid Content-Length header (repeated) for ${url}`);
  }
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    throw new SafeFetchError(`Invalid Content-Length header "${raw}" for ${url}`);
  }
  const declared = Number(text);
  if (!Number.isSafeInteger(declared)) {
    throw new SafeFetchError(`Invalid Content-Length header "${raw}" for ${url}`);
  }
  if (declared > MAX_BODY_BYTES) {
    throw new SafeFetchError(
      `Response body exceeds ${MAX_BODY_BYTES} bytes (content-length ${declared}): ${url}`
    );
  }
  return declared;
}

function performRequest(
  target: ValidatedTarget,
  remainingMs: number,
  originalUrl: string,
  totalTimeout: number,
  followRedirects: boolean
): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const isHttps = target.url.protocol === 'https:';
    const port = target.url.port !== '' ? Number(target.url.port) : isHttps ? 443 : 80;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: ClientRequest | undefined;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request?.destroy();
      reject(error);
    };

    const succeed = (response: RawResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };

    timer = setTimeout(() => {
      fail(new SafeFetchError(`Request timed out after ${totalTimeout}ms: ${originalUrl}`));
    }, remainingMs);

    const requestFn = isHttps ? httpsRequest : httpRequest;
    request = requestFn(
      {
        host: target.hostname,
        port,
        path: `${target.url.pathname}${target.url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: ACCEPT,
          'Accept-Encoding': 'identity',
          // Single-shot connections: nothing is pooled, so a truncated or
          // desynchronised response cannot leak into a later request.
          Connection: 'close',
        },
        lookup: createPinnedLookup(target.address, target.family),
        // TLS handshake keeps the original hostname for SNI and certificate checks.
        ...(isHttps ? { servername: target.hostname } : {}),
      },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        const headers = normalizeHeaders(response.headers);

        let declared: number | undefined;
        try {
          declared = parseContentLength(response.headers['content-length'], originalUrl);
        } catch (error) {
          fail(error as Error);
          return;
        }

        // When the chain continues, the redirect body is never used: settle on
        // headers and release the socket so a hanging or oversized redirect
        // body cannot stall the chain. Returned 3xx responses still read their
        // body normally, up to the cap.
        if (followRedirects && status >= 300 && status < 400 && headers.location !== undefined) {
          succeed({ status, headers, body: '' });
          response.resume();
          request?.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;

        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_BODY_BYTES) {
            fail(
              new SafeFetchError(`Response body exceeds ${MAX_BODY_BYTES} bytes: ${originalUrl}`)
            );
            return;
          }
          chunks.push(chunk);
        });

        response.on('aborted', () =>
          fail(new SafeFetchError(`Response closed before completion: ${originalUrl}`))
        );

        response.on('error', (error: Error) => fail(error));

        response.on('end', () => {
          if (declared !== undefined && received !== declared) {
            fail(
              new SafeFetchError(
                `Response closed after ${received} of ${declared} declared bytes: ${originalUrl}`
              )
            );
            return;
          }
          succeed({
            status,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    request.on('error', (error: Error) => fail(error));
    request.end();
  });
}

export async function safeFetchWithInternals(
  urlString: string,
  options: SafeFetchOptions = {},
  internals: SafeFetchInternals = {}
): Promise<SafeFetchResponse> {
  const { timeout = 10_000, followRedirects = false } = options;
  const start = Date.now();
  const deadline = start + timeout;
  let currentUrl = urlString;

  for (let hop = 0; ; hop++) {
    const target = await validateTarget(currentUrl, internals);

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SafeFetchError(`Request timed out after ${timeout}ms: ${urlString}`);
    }

    let raw: RawResponse;
    try {
      raw = await performRequest(target, remaining, urlString, timeout, followRedirects);
    } catch (error) {
      if (error instanceof SafeFetchError) throw error;
      throw new Error(`Fetch failed (${Date.now() - start}ms): ${urlString} — ${String(error)}`);
    }

    const location = raw.headers.location;
    const isRedirect = raw.status >= 300 && raw.status < 400 && location !== undefined;

    if (!followRedirects || !isRedirect) {
      return {
        status: raw.status,
        headers: raw.headers,
        body: raw.body,
        responseTime: Date.now() - start,
        url: urlString,
      };
    }

    if (hop >= MAX_REDIRECTS) {
      throw new SafeFetchError(`Too many redirects (max ${MAX_REDIRECTS}): ${urlString}`);
    }

    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new SafeFetchError(`Invalid redirect Location "${location}" from ${currentUrl}`);
    }
  }
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
