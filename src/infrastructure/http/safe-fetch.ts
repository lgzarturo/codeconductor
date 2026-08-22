import { safeFetchWithInternals } from './safe-fetch-internal';
import type { SafeFetchOptions, SafeFetchResponse } from '../../domain/seo/seo-types';

export { delay } from './safe-fetch-internal';

/**
 * Production surface of the SSRF-guarded fetch. The implementation in
 * `safe-fetch-internal.ts` carries a third argument with the test-only seams
 * (DNS stub, loopback allowance); this wrapper forwards only the production
 * arguments, so no caller can weaken the guard even by casting.
 */
export async function safeFetch(
  urlString: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  return safeFetchWithInternals(urlString, options);
}
