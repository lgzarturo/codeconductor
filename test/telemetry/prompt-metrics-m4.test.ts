/**
 * M4 prompt metrics + compiled prompt-diff.
 * Closure: v1.7.1 → v1.7.2 hashes stable across 2 runs.
 */
import { describe, expect, test } from 'bun:test';
import {
  computeCacheHitRate,
  computeDeadRatio,
  computeDupRatio,
  estimateTokens,
  measureCompiledPrompt,
  promptFingerprintFromLayers,
  sha256Hex,
} from '../../src/core/ccep/prompt-metrics';
import { compilePrompt } from '../../src/core/ccep/prompt-compiler';
import {
  buildHarnessV1CompileContext,
  diffCompiledPromptVersions,
} from '../../src/core/evaluation/prompt-diff';
import { PACKAGE_ROOT } from '../../src/core/presets/package-paths';

describe('M4 prompt-metrics', () => {
  test('measures layers, fingerprint, and dupRatio on harness-v1 compile', async () => {
    const fixed = buildHarnessV1CompileContext({ projectRoot: PACKAGE_ROOT });
    const compiled = compilePrompt({
      role: fixed.role,
      phase: fixed.phase,
      context: fixed.context,
      promptVersion: fixed.promptVersion,
    });
    const metrics = await measureCompiledPrompt(compiled);
    expect(metrics.layers.length).toBeGreaterThanOrEqual(7);
    expect(metrics.totalBytes).toBeGreaterThan(0);
    expect(metrics.totalTokens).toBe(
      metrics.layers.reduce((s, l) => s + l.tokens, 0),
    );
    expect(metrics.tokenBasis).toBe('estimate');
    expect(estimateTokens(100)).toBe(25);
    expect(metrics.promptFingerprint).toBe(promptFingerprintFromLayers(compiled.layers));
    expect(metrics.promptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(metrics.dupRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.dupRatio).toBeLessThanOrEqual(1);
    expect(metrics.groups.system.bytes).toBeGreaterThan(0);
    expect(metrics.groups.spec.bytes).toBeGreaterThan(0);
  });

  test('warns when dupRatio exceeds threshold', async () => {
    const repeated = Array.from({ length: 20 }, () => 'duplicate line of content').join('\n');
    const compiled = {
      layers: [
        { name: 'system' as const, content: repeated },
        { name: 'agent' as const, content: repeated },
        { name: 'policies' as const, content: '{}' },
        { name: 'knowledge' as const, content: '{}' },
        { name: 'ast' as const, content: '{}' },
        { name: 'task' as const, content: repeated },
        { name: 'output_schema' as const, content: 'schema' },
      ],
      prompt: '',
      outputSchema: 'agent-output',
    };
    const metrics = await measureCompiledPrompt(compiled, { dupRatioWarnAt: 0.1 });
    expect(metrics.dupRatio).toBeGreaterThan(0.1);
    expect(metrics.warnings.some((w) => w.includes('dupRatio'))).toBe(true);
    const { top5 } = computeDupRatio(compiled.layers);
    expect(top5.length).toBeGreaterThan(0);
  });

  test('deadRatio and cacheHitRate helpers', () => {
    expect(computeDeadRatio(['a', 'b', 'c'], ['a'])).toBeCloseTo(2 / 3);
    expect(computeDeadRatio([], [])).toBe(0);
    expect(
      computeCacheHitRate({ input: 100, cacheRead: 100, cacheWrite: 0 }),
    ).toBeCloseTo(0.5);
    expect(computeCacheHitRate({ input: null, cacheRead: null, cacheWrite: null })).toBeNull();
    expect(sha256Hex('x')).toHaveLength(64);
  });
});

describe('M4 prompt-diff --compiled (v1.7.1 → v1.7.2)', () => {
  test('hashes are stable across 2 runs', async () => {
    const run1 = await diffCompiledPromptVersions('v1.7.1', 'v1.7.2', {
      gitRoot: PACKAGE_ROOT,
      projectRoot: PACKAGE_ROOT,
    });
    const run2 = await diffCompiledPromptVersions('v1.7.1', 'v1.7.2', {
      gitRoot: PACKAGE_ROOT,
      projectRoot: PACKAGE_ROOT,
    });

    expect(run1.from.promptFingerprint).toBe(run2.from.promptFingerprint);
    expect(run1.to.promptFingerprint).toBe(run2.to.promptFingerprint);
    expect(run1.comparisonId).toBe(run2.comparisonId);
    expect(run1.deltaDupRatio).toBe(run2.deltaDupRatio);

    for (const layer of run1.layers) {
      const other = run2.layers.find((l) => l.name === layer.name);
      expect(other).toBeDefined();
      expect(other!.fromSha256).toBe(layer.fromSha256);
      expect(other!.toSha256).toBe(layer.toSha256);
      expect(other!.deltaBytes).toBe(layer.deltaBytes);
    }

    // Fingerprints are real sha256 hex
    expect(run1.from.promptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(run1.to.promptFingerprint).toMatch(/^[a-f0-9]{64}$/);
  }, 120_000);
});
