/**
 * Compiled-prompt metrics (§2): per-layer size, dupRatio, fingerprint, warnings.
 * Tokens default to estimate (bytes/4); optional exact count via injected counter.
 */
import { createHash } from 'node:crypto';
import type { CompiledPrompt, PromptLayer } from './prompt-compiler';

export type PromptLayerName = PromptLayer['name'];

export type TokenBasis = 'estimate' | 'exact';

export interface LayerMetrics {
  name: PromptLayerName;
  bytes: number;
  tokens: number;
  tokenBasis: TokenBasis;
  sha256: string;
}

/** Arturo grouping over the 8 PromptLayer names. */
export interface GroupMetrics {
  system: { bytes: number; tokens: number }; // system+agent+policies
  skills: { bytes: number; tokens: number }; // rules (skills ids / SKILL content)
  spec: { bytes: number; tokens: number }; // task (+ openspec in task layer)
  context: { bytes: number; tokens: number }; // knowledge+ast
  memory: { bytes: number; tokens: number }; // knowledge subset labeled memory when present
  outputSchema: { bytes: number; tokens: number };
}

export interface DupBlock {
  sha256: string;
  bytes: number;
  /** Layer names where the shingle appears. */
  layers: string[];
  /** Omitted in privacy:strict. */
  preview: string | null;
}

export interface PromptMetrics {
  layers: LayerMetrics[];
  groups: GroupMetrics;
  totalBytes: number;
  totalTokens: number;
  tokenBasis: TokenBasis;
  dupRatio: number;
  dupBlocksTop5: DupBlock[];
  /** Heuristic; null when no activation evidence. reliability medium. */
  deadRatio: number | null;
  deadReliability: 'medium' | null;
  /** cacheRead / (input + cacheRead + cacheWrite); null when usage missing. */
  cacheHitRate: number | null;
  promptFingerprint: string;
  warnings: string[];
}

export interface MeasurePromptOptions {
  /** Override token counter (exact). Default: estimate bytes/4. */
  countTokens?: (text: string) => number | Promise<number>;
  /** Privacy: omit shingle preview text. */
  privacy?: 'standard' | 'strict';
  /** dupRatio warning threshold (default 0.10). */
  dupRatioWarnAt?: number;
  /**
   * Skills/rules injected into the prompt vs skills observed activated.
   * When omitted, deadRatio stays null.
   */
  deadTokens?: {
    injectedIds: readonly string[];
    activatedIds: readonly string[];
  };
  /** Optional usage for cache hit rate. */
  usage?: {
    input: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
  };
}

const SHINGLE_LINES = 8;

export function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function layerBytes(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}

/**
 * Normalize lines for shingle hashing: trim trailing whitespace, drop empty.
 */
function normalizeLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/u, ''))
    .filter((l) => l.length > 0);
}

interface ShingleHit {
  hash: string;
  bytes: number;
  layer: string;
  preview: string;
}

function collectShingles(layers: readonly PromptLayer[]): ShingleHit[] {
  const hits: ShingleHit[] = [];
  for (const layer of layers) {
    const lines = normalizeLines(layer.content);
    if (lines.length < SHINGLE_LINES) {
      if (lines.length === 0) continue;
      const block = lines.join('\n');
      hits.push({
        hash: sha256Hex(block),
        bytes: layerBytes(block),
        layer: layer.name,
        preview: block.slice(0, 120),
      });
      continue;
    }
    for (let i = 0; i <= lines.length - SHINGLE_LINES; i++) {
      const block = lines.slice(i, i + SHINGLE_LINES).join('\n');
      hits.push({
        hash: sha256Hex(block),
        bytes: layerBytes(block),
        layer: layer.name,
        preview: block.slice(0, 120),
      });
    }
  }
  return hits;
}

export function computeDupRatio(
  layers: readonly PromptLayer[],
  privacy: 'standard' | 'strict' = 'standard',
): { dupRatio: number; top5: DupBlock[]; totalShingleBytes: number; dupBytes: number } {
  const hits = collectShingles(layers);
  const totalShingleBytes = hits.reduce((s, h) => s + h.bytes, 0);
  if (totalShingleBytes === 0) {
    return { dupRatio: 0, top5: [], totalShingleBytes: 0, dupBytes: 0 };
  }

  const byHash = new Map<string, ShingleHit[]>();
  for (const h of hits) {
    const list = byHash.get(h.hash) ?? [];
    list.push(h);
    byHash.set(h.hash, list);
  }

  let dupBytes = 0;
  const blocks: DupBlock[] = [];
  for (const [hash, list] of byHash) {
    if (list.length < 2) continue;
    // Count all but one occurrence as duplicated bytes.
    const sorted = [...list].sort((a, b) => a.bytes - b.bytes);
    const keep = sorted[0]!;
    for (let i = 1; i < sorted.length; i++) {
      dupBytes += sorted[i]!.bytes;
    }
    blocks.push({
      sha256: hash,
      bytes: keep.bytes * (list.length - 1),
      layers: [...new Set(list.map((h) => h.layer))],
      preview: privacy === 'strict' ? null : keep.preview,
    });
  }

  blocks.sort((a, b) => b.bytes - a.bytes);
  const dupRatio = dupBytes / totalShingleBytes;
  return { dupRatio, top5: blocks.slice(0, 5), totalShingleBytes, dupBytes };
}

export function computeDeadRatio(
  injectedIds: readonly string[],
  activatedIds: readonly string[],
): number {
  if (injectedIds.length === 0) return 0;
  const activated = new Set(activatedIds);
  const dead = injectedIds.filter((id) => !activated.has(id)).length;
  return dead / injectedIds.length;
}

export function computeCacheHitRate(usage: {
  input: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
}): number | null {
  const input = usage.input ?? 0;
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  const denom = input + cacheRead + cacheWrite;
  if (usage.cacheRead === null && usage.input === null && usage.cacheWrite === null) {
    return null;
  }
  if (denom <= 0) return null;
  return cacheRead / denom;
}

function emptyGroup(): { bytes: number; tokens: number } {
  return { bytes: 0, tokens: 0 };
}

function addGroup(
  g: { bytes: number; tokens: number },
  layer: LayerMetrics,
): void {
  g.bytes += layer.bytes;
  g.tokens += layer.tokens;
}

export function groupLayerMetrics(layers: readonly LayerMetrics[]): GroupMetrics {
  const groups: GroupMetrics = {
    system: emptyGroup(),
    skills: emptyGroup(),
    spec: emptyGroup(),
    context: emptyGroup(),
    memory: emptyGroup(),
    outputSchema: emptyGroup(),
  };
  for (const layer of layers) {
    switch (layer.name) {
      case 'system':
      case 'agent':
      case 'policies':
        addGroup(groups.system, layer);
        break;
      case 'rules':
        addGroup(groups.skills, layer);
        break;
      case 'task':
        addGroup(groups.spec, layer);
        break;
      case 'knowledge':
        addGroup(groups.context, layer);
        addGroup(groups.memory, layer);
        break;
      case 'ast':
        addGroup(groups.context, layer);
        break;
      case 'output_schema':
        addGroup(groups.outputSchema, layer);
        break;
      default: {
        const _exhaustive: never = layer.name;
        void _exhaustive;
        break;
      }
    }
  }
  return groups;
}

/**
 * promptFingerprint = sha256 of the concatenation of per-layer content hashes
 * (ordered by layer name as emitted by the compiler).
 */
export function promptFingerprintFromLayers(layers: readonly PromptLayer[]): string {
  const joined = layers.map((l) => sha256Hex(l.content)).join('');
  return sha256Hex(joined);
}

export async function measureCompiledPrompt(
  compiled: CompiledPrompt,
  options: MeasurePromptOptions = {},
): Promise<PromptMetrics> {
  const privacy = options.privacy ?? 'standard';
  const warnAt = options.dupRatioWarnAt ?? 0.1;
  const tokenBasis: TokenBasis = options.countTokens ? 'exact' : 'estimate';

  const layers: LayerMetrics[] = [];
  for (const layer of compiled.layers) {
    const bytes = layerBytes(layer.content);
    const tokens = options.countTokens
      ? await options.countTokens(layer.content)
      : estimateTokens(bytes);
    layers.push({
      name: layer.name,
      bytes,
      tokens,
      tokenBasis,
      sha256: sha256Hex(layer.content),
    });
  }

  const totalBytes = layers.reduce((s, l) => s + l.bytes, 0);
  const totalTokens = layers.reduce((s, l) => s + l.tokens, 0);
  const { dupRatio, top5 } = computeDupRatio(compiled.layers, privacy);

  let deadRatio: number | null = null;
  let deadReliability: 'medium' | null = null;
  if (options.deadTokens) {
    deadRatio = computeDeadRatio(
      options.deadTokens.injectedIds,
      options.deadTokens.activatedIds,
    );
    deadReliability = 'medium';
  }

  const cacheHitRate = options.usage ? computeCacheHitRate(options.usage) : null;
  const fingerprint = promptFingerprintFromLayers(compiled.layers);
  const warnings: string[] = [];
  if (dupRatio > warnAt) {
    warnings.push(
      `dupRatio ${(dupRatio * 100).toFixed(1)}% exceeds threshold ${(warnAt * 100).toFixed(0)}%`,
    );
  }

  return {
    layers,
    groups: groupLayerMetrics(layers),
    totalBytes,
    totalTokens,
    tokenBasis,
    dupRatio,
    dupBlocksTop5: top5,
    deadRatio,
    deadReliability,
    cacheHitRate,
    promptFingerprint: fingerprint,
    warnings,
  };
}

export function formatPromptMetricsMarkdown(metrics: PromptMetrics): string {
  const lines = [
    '# Prompt metrics',
    '',
    `Fingerprint: \`${metrics.promptFingerprint}\``,
    `Total: ${metrics.totalBytes} bytes · ${metrics.totalTokens} tokens (${metrics.tokenBasis})`,
    `dupRatio: ${(metrics.dupRatio * 100).toFixed(2)}%`,
    metrics.deadRatio !== null
      ? `deadRatio: ${(metrics.deadRatio * 100).toFixed(2)}% (reliability: ${metrics.deadReliability})`
      : 'deadRatio: n/a',
    metrics.cacheHitRate !== null
      ? `cacheHitRate: ${(metrics.cacheHitRate * 100).toFixed(2)}%`
      : 'cacheHitRate: n/a',
    '',
    '## Layers',
    '',
    '| Layer | Bytes | Tokens | SHA256 |',
    '| --- | ---: | ---: | --- |',
    ...metrics.layers.map(
      (l) => `| ${l.name} | ${l.bytes} | ${l.tokens} | \`${l.sha256.slice(0, 12)}…\` |`,
    ),
    '',
    '## Groups',
    '',
    `| Group | Bytes | Tokens |`,
    `| --- | ---: | ---: |`,
    `| system | ${metrics.groups.system.bytes} | ${metrics.groups.system.tokens} |`,
    `| skills | ${metrics.groups.skills.bytes} | ${metrics.groups.skills.tokens} |`,
    `| spec | ${metrics.groups.spec.bytes} | ${metrics.groups.spec.tokens} |`,
    `| context | ${metrics.groups.context.bytes} | ${metrics.groups.context.tokens} |`,
    `| memory | ${metrics.groups.memory.bytes} | ${metrics.groups.memory.tokens} |`,
    `| output_schema | ${metrics.groups.outputSchema.bytes} | ${metrics.groups.outputSchema.tokens} |`,
  ];
  if (metrics.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...metrics.warnings.map((w) => `- ${w}`));
  }
  if (metrics.dupBlocksTop5.length > 0) {
    lines.push('', '## Top duplicated shingles', '');
    for (const b of metrics.dupBlocksTop5) {
      lines.push(
        `- \`${b.sha256.slice(0, 12)}…\` · ${b.bytes} B · layers: ${b.layers.join(', ')}`,
      );
    }
  }
  return lines.join('\n');
}
