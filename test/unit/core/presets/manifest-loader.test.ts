import { describe, expect, test } from 'bun:test';
import {
  clearPresetCache,
  loadManifest,
  loadModelConfig,
  loadTargetCapabilities,
} from '../../../../src/core/presets/manifest-loader';

describe('core/presets/manifest-loader cache', () => {
  test('returns the same parsed object per target within a process', async () => {
    clearPresetCache();
    try {
      expect(await loadManifest('claude')).toBe(await loadManifest('claude'));
      expect(await loadModelConfig('claude')).toBe(await loadModelConfig('claude'));
      expect(await loadTargetCapabilities('claude')).toBe(
        await loadTargetCapabilities('claude'),
      );
    } finally {
      clearPresetCache();
    }
  });

  test('clearPresetCache forces a fresh parse with equal content', async () => {
    clearPresetCache();
    try {
      const before = await loadManifest('cursor');
      clearPresetCache();
      const after = await loadManifest('cursor');
      expect(after).not.toBe(before);
      expect(after).toEqual(before);
    } finally {
      clearPresetCache();
    }
  });
});
