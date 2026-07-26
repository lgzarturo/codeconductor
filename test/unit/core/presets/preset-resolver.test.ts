import { describe, expect, test } from 'bun:test';
import { resolvePreset, type PresetStack } from '../../../../src/core/presets/preset-resolver';
import { INDIVIDUAL_TARGETS } from '../../../../src/core/runner/runner-target';

type Profile = Parameters<typeof resolvePreset>[1];

const profile = (over: Partial<Profile> = {}): Profile => ({
  frameworks: [],
  runtimes: [],
  signals: ['package.json'],
  confidence: 'high',
  ...over,
});

describe('core/presets/preset-resolver', () => {
  describe('stack resolution', () => {
    const frameworkCases: Array<[string, PresetStack]> = [
      ['spring', 'spring'],
      ['django', 'django'],
      ['astro', 'astro'],
      ['nextjs', 'nextjs'],
      ['fastapi', 'fastapi'],
      ['backend', 'backend'],
      ['frontend', 'frontend'],
      ['android', 'android'],
      ['laravel', 'laravel'],
    ];

    for (const [framework, stack] of frameworkCases) {
      test(`framework ${framework} resolves to the ${stack} stack`, () => {
        expect(resolvePreset('claude', profile({ frameworks: [framework] })).stack).toBe(stack);
      });
    }

    test('runtime php/bun/node resolve to their stacks', () => {
      expect(resolvePreset('claude', profile({ runtimes: ['php'] })).stack).toBe('php');
      expect(resolvePreset('claude', profile({ runtimes: ['bun'] })).stack).toBe('bun');
      expect(resolvePreset('claude', profile({ runtimes: ['node'] })).stack).toBe('node');
    });

    test('no recognizable signals resolve to unknown', () => {
      expect(resolvePreset('claude', profile({ signals: [] })).stack).toBe('unknown');
    });
  });

  describe('architecture inference', () => {
    test('a workspace signal marks the project as a monorepo', () => {
      const res = resolvePreset('claude', profile({ signals: ['pnpm-workspace.yaml'] }));
      expect(res.architecture).toBe('monorepo');
    });

    test('ordinary signals mark a single project', () => {
      expect(resolvePreset('claude', profile({ signals: ['package.json'] })).architecture).toBe('single-project');
    });

    test('no signals leave the architecture unknown and warn', () => {
      const res = resolvePreset('claude', profile({ signals: [] }));
      expect(res.architecture).toBe('unknown');
      expect(res.warnings.some((w) => w.includes('architecture could not be inferred'))).toBe(true);
    });
  });

  describe('warnings', () => {
    test('low confidence produces a review warning', () => {
      const res = resolvePreset('claude', profile({ confidence: 'low', frameworks: ['spring'] }));
      expect(res.warnings.some((w) => w.includes('confidence is low'))).toBe(true);
    });

    test('unknown stack warns about the generic preset', () => {
      const res = resolvePreset('claude', profile({ signals: [] }));
      expect(res.warnings.some((w) => w.includes('No supported stack'))).toBe(true);
    });

    test('a known stack warns that asset pruning is not implemented', () => {
      const res = resolvePreset('opencode', profile({ frameworks: ['django'] }));
      expect(res.warnings.some((w) => w.includes('asset pruning is not implemented'))).toBe(true);
    });
  });

  describe('assets per target', () => {
    test('every individual target returns a non-empty asset list', () => {
      for (const target of INDIVIDUAL_TARGETS) {
        const res = resolvePreset(target, profile());
        expect(res.assets.length).toBeGreaterThan(0);
        expect(res.target).toBe(target);
      }
    });

    test('target-specific anchor assets are present', () => {
      expect(resolvePreset('opencode', profile()).assets).toContain('opencode.jsonc');
      expect(resolvePreset('claude', profile()).assets).toContain('CLAUDE.md');
      expect(resolvePreset('codex', profile()).assets).toContain('AGENTS.md');
      expect(resolvePreset('cursor', profile()).assets).toContain('.cursorignore');
      expect(resolvePreset('agy', profile()).assets).toContain('workflows');
    });
  });

  test('reports the current preset version', () => {
    expect(resolvePreset('claude', profile()).presetVersion).toBe('v0.5.0');
  });
});
