import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { copyFromManifest } from '../src/core/presets/file-copier';
import { loadManifest } from '../src/core/presets/manifest-loader';
import {
  hasTriggerLanguage,
  parseSkillFrontmatter,
  skillIdentifier,
} from '../src/core/presets/skill-frontmatter';
import { loadSharedSkills } from '../scripts/sync-shared-skills';

const ROOT = resolve(import.meta.dir, '..');
const SKILL = 'android-ui-design';
const CANONICAL_PATH = join(ROOT, 'skills', SKILL, 'SKILL.md');
const RUNNERS = ['claude', 'codex', 'cursor', 'opencode', 'agy', 'gemini', 'pi'] as const;
const PHYSICAL_TARGETS = ['claude', 'codex', 'cursor', 'opencode', 'agy'] as const;
const WORKFLOWS = ['feature', 'fix', 'review', 'openspec'] as const;

function expectConcept(
  content: string,
  label: string,
  alternatives: readonly RegExp[],
): void {
  expect(
    alternatives.some((pattern) => pattern.test(content)),
    `missing ${label}; expected one of ${alternatives.map(String).join(', ')}`,
  ).toBe(true);
}

function workflowResults(
  results: readonly { readonly dest: string }[],
  workflow: (typeof WORKFLOWS)[number],
): readonly { readonly dest: string }[] {
  return results.filter((result) =>
    result.dest.endsWith(`/cc-${workflow}/SKILL.md`)
    || result.dest.endsWith(`/cc-${workflow}.md`)
    || result.dest.endsWith(`/cc/${workflow}.md`)
    || result.dest.endsWith(`/cc/${workflow}.toml`),
  );
}

describe('android UI design public contract', () => {
  test('has valid discoverable frontmatter with a concrete and bounded auto-trigger', async () => {
    expect(existsSync(CANONICAL_PATH), 'canonical android-ui-design skill').toBe(true);
    const content = await readFile(CANONICAL_PATH, 'utf-8');
    const parsed = parseSkillFrontmatter(content);

    expect(parsed.ok, parsed.ok ? undefined : parsed.error.message).toBe(true);
    if (!parsed.ok) return;

    expect(skillIdentifier(parsed.frontmatter)).toBe(SKILL);
    expect(hasTriggerLanguage(parsed.frontmatter)).toBe(true);

    const description = parsed.frontmatter.description;
    for (const [label, pattern] of [
      ['Android', /android/i],
      ['Jetpack Compose', /jetpack compose/i],
      ['UI or UX', /\b(?:ui|ux|interface)\b/i],
      ['design', /design/i],
      ['implementation', /implement/i],
      ['review', /review/i],
      ['audit', /audit/i],
    ] as const) {
      expect(description, `description must identify ${label} scope`).toMatch(pattern);
    }
    expect(description).toMatch(/not[^.]{0,100}(?:framework|dependency)[^.]{0,60}(?:presence|alone)/i);
    expect(description).toMatch(/not[^.]{0,80}non[- ]ui|non[- ]ui[^.]{0,80}(?:excluded|work|task)/i);
  });

  test('registers the initial public version', async () => {
    const registry = JSON.parse(await readFile(join(ROOT, 'skills-registry.json'), 'utf-8'));
    expect(registry.skills[SKILL]?.version).toBe('1.0.0');
  });

  test('defines distinct design, implementation, review, and audit modes', async () => {
    const content = await readFile(CANONICAL_PATH, 'utf-8');
    const headings = [...content.matchAll(/^#{2,4}\s+(.+)$/gm)].map((match) => match[1]);

    for (const [mode, stem] of [
      ['design', /design/i],
      ['implementation', /implement/i],
      ['review', /review/i],
      ['audit', /audit/i],
    ] as const) {
      expect(
        headings.some((heading) => stem.test(heading)),
        `${mode} must be an explicit behavioral mode`,
      ).toBe(true);
    }

    expectConcept(content, 'read-only audit boundary', [
      /audit[\s\S]{0,500}read[- ]only/i,
      /audit[\s\S]{0,500}(?:do not|does not|must not)[\s\S]{0,80}(?:edit|implement|modify|fix)/i,
      /audit[\s\S]{0,500}not permission to (?:edit|implement|modify|fix)/i,
    ]);
  });

  test('preserves the product visual system and treats Material 3 as advisory', async () => {
    const content = await readFile(CANONICAL_PATH, 'utf-8');

    expectConcept(content, 'existing visual system preservation', [
      /(?:preserve|reuse|respect)[^\n.]{0,100}(?:existing|established)[^\n.]{0,80}(?:visual|design|component|token)/i,
      /(?:existing|established)[^\n.]{0,80}(?:visual|design) (?:system|language)[^\n.]{0,100}(?:preserve|reuse|respect)/i,
    ]);
    expect(content).toMatch(/material\s*3/i);
    expectConcept(content, 'Material 3 advisory boundary', [
      /material\s*3[^\n.]{0,120}(?:advisory|guidance|not (?:a )?mandate|do not (?:mandate|replace)|where (?:it )?fits)/i,
      /(?:advisory|guidance|not (?:a )?mandate|do not (?:mandate|replace))[^\n.]{0,120}material\s*3/i,
    ]);
  });

  test('covers phone interaction states and accessibility criteria', async () => {
    const content = await readFile(CANONICAL_PATH, 'utf-8');

    for (const [label, alternatives] of [
      ['default state', [/\bdefault\b/i, /\brest(?:ing)? state\b/i]],
      ['pressed state', [/\bpress(?:ed)?\b/i]],
      ['focused state', [/\bfocus(?:ed)?\b/i]],
      ['disabled state', [/\bdisabled\b/i]],
      ['pending or loading state', [/\bpending\b/i, /\bloading\b/i]],
      ['empty state', [/\bempty\b/i]],
      ['success state', [/\bsuccess(?:ful)?\b/i]],
      ['error state', [/\berror\b/i, /\bfailure\b/i]],
      ['offline state', [/\boffline\b/i]],
      ['48dp touch target', [/48\s*dp[^\n.]{0,50}(?:touch|target)/i, /(?:touch|target)[^\n.]{0,50}48\s*dp/i]],
      ['accessibility semantics', [/\bsemantics?\b/i]],
      ['TalkBack', [/talkback/i]],
      ['contrast', [/\bcontrast\b/i]],
      ['font scaling', [/font scal/i, /scaled (?:font|text)/i]],
      ['traversal order', [/\btraversal\b/i, /focus order/i]],
    ] as const) {
      expectConcept(content, label, alternatives);
    }
  });

  test('covers phone system behavior, layout, motion, and state ownership', async () => {
    const content = await readFile(CANONICAL_PATH, 'utf-8');

    for (const [label, alternatives] of [
      ['gesture behavior', [/\bgestures?\b/i]],
      ['focus and input method behavior', [/\bime\b/i, /soft keyboard/i]],
      ['edge-to-edge and system chrome', [/edge[- ]to[- ]edge/i, /window insets?/i, /system bars?/i]],
      ['back navigation', [/predictive back/i, /back (?:navigation|gesture|behavior)/i]],
      ['phone layout', [/phone[^\n.]{0,80}layout/i, /layout[^\n.]{0,80}phone/i]],
      ['orientation', [/\borientation\b/i, /\bportrait\b[^\n.]{0,50}\blandscape\b/i]],
      ['purposeful motion', [/purpose(?:ful)?[^\n.]{0,60}(?:motion|animation)/i, /(?:motion|animation)[^\n.]{0,60}purpose/i]],
      ['motion interruption', [/interrupt/i, /cancel(?:lation|led)?/i, /revers(?:e|al)/i]],
      ['repeated interaction', [/repeat(?:ed|ition)?/i, /rapid[^\n.]{0,30}(?:input|tap|interaction)/i]],
      ['reduced animation', [/reduced?[- ](?:motion|animation)/i, /animator duration scale/i]],
      ['state ownership', [/state owner(?:ship)?/i, /single source of truth/i, /state hoist/i]],
      ['unidirectional data flow', [/unidirectional data flow/i, /\budf\b/i]],
    ] as const) {
      expectConcept(content, label, alternatives);
    }
  });

  test('requires observable outcomes and honest pending visual or emulator evidence', async () => {
    const content = await readFile(CANONICAL_PATH, 'utf-8');

    expectConcept(content, 'observable test outcomes', [
      /observable[^\n.]{0,80}(?:outcome|behavior|state|result)/i,
      /test[^\n.]{0,80}observable[^\n.]{0,80}(?:outcome|behavior|state|result)/i,
    ]);
    expectConcept(content, 'pending evidence when visual tooling is unavailable', [
      /(?:visual|emulator|device)[^\n.]{0,160}(?:pending|unavailable|limitation)/i,
      /(?:pending|unavailable|limitation)[^\n.]{0,160}(?:visual|emulator|device)/i,
    ]);
    expectConcept(content, 'no unsupported validation claims', [
      /do not claim[^\n.]{0,100}(?:visual|emulator|device|validation|verified)/i,
      /must not claim[^\n.]{0,100}(?:visual|emulator|device|validation|verified)/i,
      /cannot claim[^\n.]{0,100}(?:visual|emulator|device|validation|verified)/i,
    ]);
  });

  test('hands general Android engineering to android and names every workflow route', async () => {
    const content = await readFile(CANONICAL_PATH, 'utf-8');

    expect(content).toContain('`android`');
    expectConcept(content, 'general Android handoff', [
      /`android`[^\n.]{0,140}(?:architecture|dependency injection|media|performance|testing|non[- ]ui)/i,
      /(?:architecture|dependency injection|media|performance|testing|non[- ]ui)[^\n.]{0,140}`android`/i,
    ]);
    for (const workflow of WORKFLOWS) {
      expect(content, `missing cc-${workflow} workflow route`).toContain(`cc-${workflow}`);
    }
  });
});

describe('android UI design distribution', () => {
  test('declares exactly five shared physical targets', () => {
    const entry = loadSharedSkills().find((candidate) => candidate.name === SKILL);
    expect(entry, `${SKILL} shared manifest entry`).toBeDefined();
    expect([...(entry?.targets ?? [])].sort()).toEqual([...PHYSICAL_TARGETS].sort());
  });

  test('ships five byte-identical physical preset copies', async () => {
    const glob = new Bun.Glob(`*/skills/${SKILL}/SKILL.md`);
    const copies: string[] = [];
    for await (const path of glob.scan({ cwd: join(ROOT, 'presets') })) copies.push(path);

    expect(copies.sort()).toEqual(
      PHYSICAL_TARGETS.map((target) => `${target}/skills/${SKILL}/SKILL.md`).sort(),
    );
    const canonical = await readFile(CANONICAL_PATH, 'utf-8');
    for (const copy of copies) {
      expect(await readFile(join(ROOT, 'presets', copy), 'utf-8'), copy).toBe(canonical);
    }
  });

  for (const runner of RUNNERS) {
    test(`${runner} installs both Android skills byte-exactly and routes UI workflows`, async () => {
      const dir = await mkdtemp(join(tmpdir(), `cc-android-ui-${runner}-`));
      try {
        const manifest = await loadManifest(runner);
        const results = await copyFromManifest(
          manifest, join(ROOT, 'presets'), dir, false, false, false,
        );
        expect(results.filter((result) => result.action === 'error')).toEqual([]);

        const skillEntry = manifest.entries.find((entry) => entry.dest.endsWith('/skills'));
        expect(skillEntry, `${runner}: skills manifest entry`).toBeDefined();
        const skillRoot = join(dir, skillEntry!.dest);
        const installedPath = join(skillRoot, SKILL, 'SKILL.md');
        expect(existsSync(installedPath), `${runner}: ${SKILL} installed`).toBe(true);
        expect(await readFile(installedPath, 'utf-8')).toBe(await readFile(CANONICAL_PATH, 'utf-8'));

        const androidPath = join(skillRoot, 'android', 'SKILL.md');
        expect(existsSync(androidPath), `${runner}: android handoff skill installed`).toBe(true);
        const android = await readFile(androidPath, 'utf-8');
        expect(android).toContain(SKILL);
        expect(android).toMatch(/android-ui-design[^\n.]{0,80}owns specialized/i);
        for (const [label, alternatives] of [
          ['architecture', [/\bMVI\b/i, /\bMVVM\b/i, /architecture/i]],
          ['dependency injection', [/\bHilt\b/i, /dependency injection/i]],
          ['media', [/Media3/i, /ExoPlayer/i]],
          ['performance', [/performance/i, /recomposition/i]],
          ['testing', [/\btesting\b/i, /\btests?\b/i]],
        ] as const) {
          expectConcept(android, `${runner}: retained Android ${label}`, alternatives);
        }

        for (const workflow of WORKFLOWS) {
          const candidates = workflowResults(results, workflow);
          expect(candidates.length, `${runner}: cc-${workflow} workflow installed`).toBeGreaterThan(0);
          for (const candidate of candidates) {
            expect(await readFile(candidate.dest, 'utf-8'), candidate.dest).toContain(SKILL);
          }
        }

        const routingGuide = await readFile(join(skillRoot, 'using-cc-skills', 'SKILL.md'), 'utf-8');
        expect(routingGuide, `${runner}: using-cc-skills routes Android UI work`).toContain(SKILL);
        const openspecGuide = await readFile(join(skillRoot, 'openspec', 'SKILL.md'), 'utf-8');
        expect(openspecGuide, `${runner}: openspec routes Android UI work`).toContain(SKILL);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
});
