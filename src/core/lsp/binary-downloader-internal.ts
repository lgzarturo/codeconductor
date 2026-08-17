/**
 * Streaming download for pinned LSP binaries.
 *
 * `fetch(url, { redirect: 'follow' })` hands redirect handling to the runtime,
 * so only the first URL is ever checked and the whole body is buffered without
 * a ceiling. Here every hop — the original URL included — is re-validated
 * before a socket is opened, the connection is pinned to the address that was
 * validated, and the body is refused as soon as it grows past the cap.
 *
 * The address and loopback predicates are shared with the SSRF-guarded fetch so
 * both paths block the same ranges.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  createPinnedLookup,
  isBlockedAddress,
  isLoopbackAddress,
  type ResolvedAddress,
} from '../../infrastructure/http/safe-fetch-internal';
import { assertPinnedBinaryUrl } from './binary-integrity';

/** Largest binary accepted, enforced on the declared length and while reading. */
export const MAX_BINARY_BYTES = 200 * 1024 * 1024;

/** Redirect hops followed before the chain is abandoned. */
export const MAX_BINARY_REDIRECTS = 5;

const USER_AGENT = 'CodeConductor-LSP/0.5.0';

/**
 * Injectable seams for the test suite only. The production module
 * (`binary-downloader.ts`) re-exports `downloadPinnedBinary` without this
 * parameter so no production caller can reach it.
 */
export interface BinaryDownloadInternals {
  readonly resolveAll?: (hostname: string) => Promise<ResolvedAddress[]>;
  readonly allowLoopback?: boolean;
  /** Permits plain http, so a loopback fixture server can stand in for a CDN. */
  readonly allowInsecureTransport?: boolean;
  /** Lowers the size cap so the streaming cutoff can be exercised cheaply. */
  readonly maxBytes?: number;
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

/**
 * Re-validate a URL from scratch: scheme, credentials, pinning policy, and the
 * addresses it resolves to. Applied to the initial URL and to every redirect.
 */
async function validateTarget(
  urlString: string,
  internals: BinaryDownloadInternals,
): Promise<ValidatedTarget> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid binary URL: ${urlString}`);
  }

  const insecureAllowed = internals.allowInsecureTransport === true;
  if (parsed.protocol !== 'https:' && !(insecureAllowed && parsed.protocol === 'http:')) {
    throw new Error(`Binary URL must use https: ${urlString}`);
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(`Blocked URL credentials for ${parsed.hostname}`);
  }
  if (parsed.protocol === 'https:') {
    assertPinnedBinaryUrl(urlString);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === '' || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error(`Blocked hostname: ${parsed.hostname}`);
  }

  const resolved = internals.resolveAll
    ? await internals.resolveAll(hostname)
    : await dnsLookup(hostname, { all: true, verbatim: true });

  if (resolved.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}: no addresses returned`);
  }

  // Every answer must be public: a name that resolves to one routable and one
  // private address must not be reachable through the private one.
  for (const candidate of resolved) {
    const allowed =
      internals.allowLoopback === true && isLoopbackAddress(candidate.address);
    if (!allowed && isBlockedAddress(candidate.address)) {
      throw new Error(
        `SSRF blocked: ${hostname} resolves to blocked IP ${candidate.address}`,
      );
    }
  }

  const pinned = resolved[0];
  return {
    url: parsed,
    hostname,
    address: pinned.address,
    family: pinned.family === 6 ? 6 : 4,
  };
}

interface HopResult {
  /** Set when the response was a redirect; the body was not read. */
  readonly location?: string;
  readonly bytes?: Uint8Array;
}

/** Content-Length must be a single decimal integer within the binary budget. */
function parseContentLength(
  raw: string | string[] | undefined,
  url: string,
  maxBytes: number,
): number | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    throw new Error(`Invalid Content-Length header (repeated) for ${url}`);
  }
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid Content-Length header "${raw}" for ${url}`);
  }
  const declared = Number(text);
  if (!Number.isSafeInteger(declared)) {
    throw new Error(`Invalid Content-Length header "${raw}" for ${url}`);
  }
  if (declared > maxBytes) {
    throw new Error(`Binary exceeds ${maxBytes} bytes (content-length ${declared}): ${url}`);
  }
  return declared;
}

function performRequest(
  target: ValidatedTarget,
  urlString: string,
  maxBytes: number,
): Promise<HopResult> {
  return new Promise<HopResult>((resolveHop, rejectHop) => {
    // Destroying the request can emit `end` synchronously, so the first verdict
    // is latched here — otherwise a refusal would be overtaken by the very
    // stream teardown it triggered.
    let settled = false;
    const succeed = (result: HopResult): void => {
      if (settled) return;
      settled = true;
      resolveHop(result);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      rejectHop(error);
    };

    const isHttps = target.url.protocol === 'https:';
    const port = target.url.port !== '' ? Number(target.url.port) : isHttps ? 443 : 80;
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const request = requestFn(
      {
        host: target.hostname,
        port,
        path: `${target.url.pathname}${target.url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/octet-stream',
          'Accept-Encoding': 'identity',
          Connection: 'close',
        },
        lookup: createPinnedLookup(target.address, target.family),
        ...(isHttps ? { servername: target.hostname } : {}),
      },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400) {
          const location = response.headers.location;
          if (typeof location !== 'string' || location.trim() === '') {
            fail(new Error(`Redirect without a Location header: ${urlString}`));
          } else {
            // The redirect body is never used: release the socket so an
            // oversized or hanging one cannot stall the chain.
            succeed({ location });
          }
          response.resume();
          request.destroy();
          return;
        }

        if (status < 200 || status >= 300) {
          fail(new Error(`Failed to download binary: HTTP ${status} — ${urlString}`));
          response.resume();
          request.destroy();
          return;
        }

        let declared: number | undefined;
        try {
          declared = parseContentLength(
            response.headers['content-length'],
            urlString,
            maxBytes,
          );
        } catch (error) {
          fail(error as Error);
          response.resume();
          request.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;

        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            fail(new Error(`Binary exceeds ${maxBytes} bytes: ${urlString}`));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });

        response.on('aborted', () =>
          fail(new Error(`Download closed before completion: ${urlString}`)),
        );
        response.on('error', (error: Error) => fail(error));

        response.on('end', () => {
          if (declared !== undefined && received !== declared) {
            fail(
              new Error(
                `Download closed after ${received} of ${declared} declared bytes: ${urlString}`,
              ),
            );
            return;
          }
          succeed({ bytes: new Uint8Array(Buffer.concat(chunks)) });
        });
      },
    );

    request.on('error', (error: Error) => fail(error));
    request.end();
  });
}

/**
 * Download a pinned binary, following at most `MAX_BINARY_REDIRECTS` hops.
 *
 * The digest is not checked here: the caller owns the expected hash and
 * verifies it before the archive is opened.
 */
export async function downloadPinnedBinaryWithInternals(
  urlString: string,
  internals: BinaryDownloadInternals = {},
): Promise<Uint8Array> {
  const maxBytes = internals.maxBytes ?? MAX_BINARY_BYTES;
  let currentUrl = urlString;

  for (let hop = 0; ; hop++) {
    const target = await validateTarget(currentUrl, internals);
    const result = await performRequest(target, currentUrl, maxBytes);

    if (result.bytes !== undefined) {
      return result.bytes;
    }

    if (hop >= MAX_BINARY_REDIRECTS) {
      throw new Error(`Too many redirects (max ${MAX_BINARY_REDIRECTS}): ${urlString}`);
    }

    try {
      currentUrl = new URL(result.location as string, currentUrl).toString();
    } catch {
      throw new Error(`Invalid redirect Location "${result.location}" from ${currentUrl}`);
    }
  }
}
