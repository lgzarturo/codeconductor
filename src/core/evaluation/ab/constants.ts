import { join } from 'node:path';

/** T-034 A/B harness ablation — hard request caps (fail-closed). */
export const AB_REQUEST_CAP = {
  free: 500,
  deepseek: 300,
} as const;

export type AbProvider = keyof typeof AB_REQUEST_CAP;

export const AB_DEFAULT_MODEL: Record<AbProvider, string> = {
  free: 'cohere/north-mini-code:free',
  deepseek: 'deepseek/deepseek-v4-flash',
};

/** Main-loop turn floor (maxTurns=3 caused error_max_turns on M5). */
export const AB_MIN_MAX_TURNS = 6;

/** Repetitions per task × arm (brief: N=5 → 50 cells with 5 tasks). */
export const AB_DEFAULT_N = 5;

export const AB_RATE_LIMIT_PER_MIN = 20;

export function isAbProvider(value: string): value is AbProvider {
  return value === 'free' || value === 'deepseek';
}

/** Default report dir outside the repo: ~/.cache/codeconductor-ab/ */
export function defaultAbOutDir(): string {
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || '/tmp';
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : `${home}/.cache`;
  return `${base}/codeconductor-ab`;
}

/**
 * Durable request counter for the campaign tope (total across `ab:run` invocations).
 * Stable path — never Date.now(). Example: `~/.cache/codeconductor-ab/counter-free.json`.
 */
export function defaultAbCounterPath(
  provider: AbProvider,
  outDir: string = defaultAbOutDir(),
): string {
  return join(outDir, `counter-${provider}.json`);
}
