import { downloadPinnedBinaryWithInternals } from './binary-downloader-internal';

/**
 * Production surface of the pinned binary downloader. The implementation in
 * `binary-downloader-internal.ts` carries a second argument with the test-only
 * seams (DNS stub, loopback and plain-http allowances); this wrapper forwards
 * only the URL, so no caller can weaken the guard even by casting.
 */
export async function downloadPinnedBinary(url: string): Promise<Uint8Array> {
  return downloadPinnedBinaryWithInternals(url);
}
