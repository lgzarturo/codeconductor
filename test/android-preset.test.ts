import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { detectProject } from '../src/core/detection/project-detector';
import { resolvePreset } from '../src/core/presets/preset-resolver';

const FIXTURES_DIR = resolve(import.meta.dir, 'fixtures');
const ANDROID_FIXTURE = resolve(FIXTURES_DIR, 'android-project');

describe('Android Preset Stack support', () => {
  test('detectProject identifies Android projects', async () => {
    const profile = await detectProject(ANDROID_FIXTURE);

    expect(profile.frameworks).toContain('android');
    expect(profile.runtimes).toContain('android');
    expect(profile.languages).toContain('kotlin');
    expect(profile.languages).toContain('java');
    expect(profile.confidence).toBe('high');
    expect(profile.signals).toContain('AndroidManifest.xml');
    expect(profile.signals).toContain('settings.gradle');
    expect(profile.signals).toContain('gradlew');
  });

  test('resolvePreset maps Android project to android stack', async () => {
    const profile = await detectProject(ANDROID_FIXTURE);
    const resolution = resolvePreset('opencode', profile);

    expect(resolution.stack).toBe('android');
  });

  test('Android skills exist in presets', () => {
    const opencodeSkill = resolve(import.meta.dir, '..', 'presets/opencode/skills/android/SKILL.md');
    const claudeSkill = resolve(import.meta.dir, '..', 'presets/claude/skills/android/SKILL.md');
    const codexSkill = resolve(import.meta.dir, '..', 'presets/codex/skills/android/SKILL.md');

    expect(existsSync(opencodeSkill)).toBe(true);
    expect(existsSync(claudeSkill)).toBe(true);
    expect(existsSync(codexSkill)).toBe(true);
  });
});

describe('Laravel and PHP Preset Stack support', () => {
  const LARAVEL_FIXTURE = resolve(FIXTURES_DIR, 'laravel-project');

  test('detectProject identifies Laravel projects', async () => {
    const profile = await detectProject(LARAVEL_FIXTURE);

    expect(profile.frameworks).toContain('laravel');
    expect(profile.languages).toContain('php');
    expect(profile.runtimes).toContain('php');
    expect(profile.signals).toContain('artisan');
    expect(profile.signals).toContain('composer.json');
  });

  test('resolvePreset maps Laravel project to laravel stack', async () => {
    const profile = await detectProject(LARAVEL_FIXTURE);
    const resolution = resolvePreset('opencode', profile);

    expect(resolution.stack).toBe('laravel');
  });

  test('Laravel and PHP skills exist in presets', () => {
    for (const preset of ['opencode', 'claude', 'codex']) {
      const laravelSkill = resolve(import.meta.dir, '..', `presets/${preset}/skills/laravel-specialist/SKILL.md`);
      const phpSkill = resolve(import.meta.dir, '..', `presets/${preset}/skills/php-pro/SKILL.md`);

      expect(existsSync(laravelSkill)).toBe(true);
      expect(existsSync(phpSkill)).toBe(true);
    }
  });
});

