/**
 * Versioned pricing table loader and cost estimator.
 * Unknown models → cost.usd = null with basis "none" (never 0).
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PACKAGE_ROOT } from '../presets/package-paths';
import type { CostBasis, TelemetryCost, TelemetryUsage } from './schema';

export const PRICING_TABLE_PATH = resolve(PACKAGE_ROOT, 'pricing', 'pricing.v1.json');
export const PRICING_STALE_DAYS = 90;

export interface PricingEntry {
  provider: string;
  modelId: string;
  unit: 'per_mtok';
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite5m: number | null;
  cacheWrite1h: number | null;
  sourceUrl: string;
  fetchedAt: string;
  note: string | null;
}

export interface PricingTable {
  version: string;
  fetchedAt: string;
  notes?: string[];
  entries: PricingEntry[];
}

let cachedTable: PricingTable | null = null;

export async function loadPricingTable(path: string = PRICING_TABLE_PATH): Promise<PricingTable> {
  if (cachedTable && path === PRICING_TABLE_PATH) return cachedTable;
  const raw = await readFile(path, 'utf-8');
  const table = JSON.parse(raw) as PricingTable;
  if (path === PRICING_TABLE_PATH) cachedTable = table;
  return table;
}

/** Clear memoized table (tests). */
export function clearPricingCache(): void {
  cachedTable = null;
}

export function pricingAgeDays(table: PricingTable, now: Date = new Date()): number {
  const fetched = Date.parse(table.fetchedAt);
  if (!Number.isFinite(fetched)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - fetched) / (1000 * 60 * 60 * 24);
}

export function isPricingStale(table: PricingTable, now: Date = new Date()): boolean {
  return pricingAgeDays(table, now) > PRICING_STALE_DAYS;
}

export function findPricingEntry(
  table: PricingTable,
  modelId: string,
  provider?: string,
): PricingEntry | null {
  const exact = table.entries.find(
    (e) => e.modelId === modelId && (provider === undefined || e.provider === provider),
  );
  if (exact) return exact;
  // Tolerate date-suffixed Anthropic IDs / vendor prefixes.
  const soft = table.entries.find((e) => {
    if (provider !== undefined && e.provider !== provider) return false;
    return (
      modelId === e.modelId ||
      modelId.startsWith(`${e.modelId}-`) ||
      modelId.endsWith(`/${e.modelId}`) ||
      e.modelId.startsWith(modelId)
    );
  });
  return soft ?? null;
}

function mtokCost(tokens: number | null, rate: number | null): number | null {
  if (tokens === null || rate === null) return null;
  return (tokens / 1_000_000) * rate;
}

export interface EstimateCostInput {
  modelId: string;
  provider?: string;
  usage: TelemetryUsage;
  /** Prefer 5m cache write rate unless overridden. */
  cacheWriteWindow?: '5m' | '1h';
  table?: PricingTable;
}

/**
 * Estimate USD from the pricing table. Returns basis "none" and usd null when
 * the model or a required rate is missing — never invents 0.
 */
export async function estimateCostFromTable(
  input: EstimateCostInput,
): Promise<TelemetryCost & { stale: boolean }> {
  const table = input.table ?? (await loadPricingTable());
  const entry = findPricingEntry(table, input.modelId, input.provider);
  if (!entry) {
    return {
      usd: null,
      basis: 'none',
      pricingVersion: table.version,
      isRealSpend: false,
      stale: isPricingStale(table),
    };
  }

  const writeRate =
    input.cacheWriteWindow === '1h' ? entry.cacheWrite1h : entry.cacheWrite5m;

  const parts = [
    mtokCost(input.usage.input, entry.input),
    mtokCost(input.usage.output, entry.output),
    mtokCost(input.usage.cacheRead, entry.cacheRead),
    mtokCost(input.usage.cacheWrite, writeRate),
  ];

  // If every contributory rate for a present token count is missing → none.
  const needed: Array<{ tokens: number | null; rate: number | null }> = [
    { tokens: input.usage.input, rate: entry.input },
    { tokens: input.usage.output, rate: entry.output },
    { tokens: input.usage.cacheRead, rate: entry.cacheRead },
    { tokens: input.usage.cacheWrite, rate: writeRate },
  ];
  const missingRequired = needed.some((n) => n.tokens !== null && n.tokens > 0 && n.rate === null);
  if (missingRequired) {
    return {
      usd: null,
      basis: 'none',
      pricingVersion: table.version,
      isRealSpend: false,
      stale: isPricingStale(table),
    };
  }

  if (parts.every((p) => p === null)) {
    return {
      usd: null,
      basis: 'none',
      pricingVersion: table.version,
      isRealSpend: false,
      stale: isPricingStale(table),
    };
  }

  const usd = parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  return {
    usd,
    basis: 'pricing-table' satisfies CostBasis,
    pricingVersion: table.version,
    isRealSpend: false,
    stale: isPricingStale(table),
  };
}

/**
 * Cost priority: provider-billed > host-estimate > pricing-table > none.
 * isRealSpend is true only for provider-billed (or explicit billing: api).
 */
export function pickCost(candidates: Array<TelemetryCost | null | undefined>): TelemetryCost {
  const order: CostBasis[] = ['provider-billed', 'host-estimate', 'pricing-table', 'none'];
  for (const basis of order) {
    const hit = candidates.find((c) => c && c.basis === basis && (basis === 'none' || c.usd !== null));
    if (hit) {
      return {
        usd: hit.usd,
        basis: hit.basis,
        pricingVersion: hit.pricingVersion ?? null,
        isRealSpend: hit.basis === 'provider-billed' ? true : (hit.isRealSpend ?? false),
      };
    }
  }
  return { usd: null, basis: 'none', pricingVersion: null, isRealSpend: false };
}
