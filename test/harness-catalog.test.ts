import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  applyCatalogToProfile,
  applyHarnessOverlay,
  componentStates,
  harnessFingerprint,
  parseComponentsFlag,
  parseVariantId,
  variantIdFor,
} from '../src/core/evaluation/harness-catalog';
import { loadWorkflowProfile } from '../src/core/ccep/workflow-profile-loader';

let TEST_DIR: string;

describe('harness-catalog', () => {
  beforeEach(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'cc-harness-catalog-'));
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('variant id is baseline or minus:component', () => {
    expect(variantIdFor()).toBe('baseline');
    expect(variantIdFor('review')).toBe('minus:review');
    expect(parseVariantId('baseline')).toEqual([]);
    expect(parseVariantId('minus:review')).toEqual(['review']);
  });

  test('fingerprint is stable for the same disabled set', () => {
    const a = harnessFingerprint(['review'], '1.0.0');
    const b = harnessFingerprint(['review'], '1.0.0');
    const c = harnessFingerprint([], '1.0.0');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(16);
  });

  test('componentStates flips only listed ids', () => {
    const states = componentStates(['review', 'product_graph']);
    expect(states.review).toBe(false);
    expect(states.product_graph).toBe(false);
    expect(states.wayfinding).toBe(true);
  });

  test('parseComponentsFlag rejects unknown ids', () => {
    const bad = parseComponentsFlag('review,not-a-thing');
    expect(bad.success).toBe(false);
    const all = parseComponentsFlag(undefined);
    expect(all.success).toBe(true);
    if (all.success) expect(all.data).toContain('review');
  });

  test('applyCatalogToProfile drops the review phase from routing', () => {
    const next = applyCatalogToProfile(loadWorkflowProfile('feature'), ['review']);
    expect(next.routing.default).not.toContain('review');
    expect(next.routing.default).toContain('implement');
  });

  test('applyHarnessOverlay writes workflow overlay and active overlay', async () => {
    const result = await applyHarnessOverlay(TEST_DIR, ['review'], {
      experimentId: 'abl-test',
      variantId: 'minus:review',
      contractVersion: '1.0.0',
    });
    expect(result.success).toBe(true);
    const yaml = await readFile(join(TEST_DIR, '.codeconductor/workflows/feature.yml'), 'utf-8');
    const profile = parse(yaml) as { routing: { default: string[] } };
    expect(profile.routing.default).not.toContain('review');
    const overlay = parse(
      await readFile(join(TEST_DIR, '.codeconductor/evaluation/active-overlay.yml'), 'utf-8')
    ) as { disabledComponents: string[]; disableProductGraph: boolean };
    expect(overlay.disabledComponents).toEqual(['review']);
    expect(overlay.disableProductGraph).toBe(false);
  });

  test('confirmation_gates clears stop gates', () => {
    const next = applyCatalogToProfile(loadWorkflowProfile('feature'), ['confirmation_gates']);
    expect(next.confirmationGate.stopOnHighRisk).toBe(false);
    expect(next.confirmationGate.stopOnQuestions).toBe(false);
    expect(next.phases.every((p) => p.stopGate === undefined)).toBe(true);
  });
});
