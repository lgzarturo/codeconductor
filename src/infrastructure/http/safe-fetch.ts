import { lookup } from 'node:dns/promises';
import type { SafeFetchOptions, SafeFetchResponse } from '../../domain/seo/seo-types';

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

async function validateUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked scheme: ${parsed.protocol}. Only http and https are allowed.`);
  }

  const hostname = parsed.hostname;

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    const addrList = Array.isArray(addresses) ? addresses : [addresses];
    for (const addr of addrList) {
      if (isPrivateIp(addr.address)) {
        throw new Error(
          `SSRF blocked: ${hostname} resolves to private IP ${addr.address}`
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SSRF blocked')) {
      throw error;
    }
    throw new Error(`DNS resolution failed for ${hostname}: ${String(error)}`);
  }
}

export async function safeFetch(
  urlString: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const { timeout = 10_000, followRedirects = false } = options;

  await validateUrl(urlString);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const start = Date.now();

  try {
    const response = await fetch(urlString, {
      method: 'GET',
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
      headers: {
        'User-Agent': 'CodeConductor-SEO/0.3.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const responseTime = Date.now() - start;
    const body = await response.text();

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      headers,
      body,
      responseTime,
      url: urlString,
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms: ${urlString}`);
    }
    throw new Error(
      `Fetch failed (${responseTime}ms): ${urlString} — ${String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
