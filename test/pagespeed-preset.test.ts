import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const PROJECT_ROOT = resolve(import.meta.dir, '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function readPreset(relativePath: string): string {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Preset file not found: ${relativePath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n') || content.startsWith('---\r\n');
}

function frontmatterClosed(content: string): boolean {
  const normalised = content.replace(/\r\n/g, '\n');
  const secondDash = normalised.indexOf('\n---\n', 4);
  return secondDash > 0;
}

// ─── SKILL.md Files ─────────────────────────────────────────────────────────

describe('pagespeed-perf skill — file existence', () => {
  const skillPaths = [
    'presets/claude/skills/pagespeed-perf/SKILL.md',
    'presets/opencode/skills/pagespeed-perf/SKILL.md',
    'presets/codex/skills/pagespeed-perf/SKILL.md',
  ];

  for (const skillPath of skillPaths) {
    test(`${skillPath} exists`, () => {
      expect(existsSync(join(PROJECT_ROOT, skillPath))).toBe(true);
    });
  }
});

describe('pagespeed-perf skill — frontmatter validity', () => {
  const skillPaths = [
    'presets/claude/skills/pagespeed-perf/SKILL.md',
    'presets/opencode/skills/pagespeed-perf/SKILL.md',
    'presets/codex/skills/pagespeed-perf/SKILL.md',
  ];

  for (const skillPath of skillPaths) {
    test(`${skillPath} has valid YAML frontmatter`, () => {
      const content = readPreset(skillPath);
      expect(hasFrontmatter(content)).toBe(true);
      expect(frontmatterClosed(content)).toBe(true);
    });

    test(`${skillPath} declares correct id`, () => {
      const content = readPreset(skillPath);
      expect(content).toContain('id: pagespeed-perf');
    });

    test(`${skillPath} declares name`, () => {
      const content = readPreset(skillPath);
      expect(content).toContain('name: PageSpeed Performance Audit');
    });

    test(`${skillPath} lists compatibility tools including claude, opencode, codex`, () => {
      const content = readPreset(skillPath);
      expect(content).toContain('claude');
      expect(content).toContain('opencode');
      expect(content).toContain('codex');
    });

    test(`${skillPath} marks requires_network: true`, () => {
      const content = readPreset(skillPath);
      expect(content).toContain('requires_network: true');
    });

    test(`${skillPath} declares url as input`, () => {
      const content = readPreset(skillPath);
      expect(content).toContain('name: url');
    });
  }
});

describe('pagespeed-perf skill — operational content', () => {
  const claudeSkill = 'presets/claude/skills/pagespeed-perf/SKILL.md';

  test('skill documents PAGESPEED_API_KEY usage', () => {
    const content = readPreset(claudeSkill);
    expect(content).toContain('PAGESPEED_API_KEY');
  });

  test('skill documents PSI API endpoint', () => {
    const content = readPreset(claudeSkill);
    expect(content).toContain('googleapis.com/pagespeedonline');
  });

  test('skill documents Core Web Vitals thresholds (LCP, CLS, TBT)', () => {
    const content = readPreset(claudeSkill);
    expect(content).toContain('LCP');
    expect(content).toContain('CLS');
    expect(content).toContain('TBT');
    expect(content).toContain('INP');
    expect(content).toContain('FCP');
  });

  test('skill documents 80/20 matrix', () => {
    const content = readPreset(claudeSkill);
    expect(content).toContain('80/20');
    expect(content).toContain('Score');
  });

  test('skill defines report output filename format', () => {
    const content = readPreset(claudeSkill);
    expect(content).toContain('pagespeed-{hostname}-claude.md');
  });

  test('skill documents quality rules (quantify, evidence, no generics)', () => {
    const content = readPreset(claudeSkill);
    expect(content).toContain('Quality Rules');
  });
});

// ─── Command Files ────────────────────────────────────────────────────────────

describe('cc-pagespeed command — Claude', () => {
  const commandPath = 'presets/claude/commands/cc/pagespeed.md';

  test('command file exists', () => {
    expect(existsSync(join(PROJECT_ROOT, commandPath))).toBe(true);
  });

  test('command documents --url parameter', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('--url');
  });

  test('command documents --strategy parameter', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('--strategy');
  });

  test('command documents PAGESPEED_API_KEY requirement', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('PAGESPEED_API_KEY');
  });

  test('command explains what is available without the key (no CrUX)', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('CrUX');
  });

  test('command references pagespeed-perf skill', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('pagespeed-perf');
  });

  test('command documents output file naming', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('pagespeed-{hostname}-claude.md');
  });

  test('command documents the 5-step workflow', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('Pre-flight');
    expect(content).toContain('Collect');
    expect(content).toContain('Analyze');
    expect(content).toContain('Prioritize');
    expect(content).toContain('Report');
  });

  test('command includes usage examples', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('cc-pagespeed');
    expect(content).toContain('https://');
  });
});

describe('cc-pagespeed command — OpenCode', () => {
  const commandPath = 'presets/opencode/commands/cc-pagespeed.md';

  test('command file exists', () => {
    expect(existsSync(join(PROJECT_ROOT, commandPath))).toBe(true);
  });

  test('command has YAML frontmatter with description', () => {
    const content = readPreset(commandPath);
    expect(hasFrontmatter(content)).toBe(true);
    expect(content).toContain('description:');
  });

  test('command documents PAGESPEED_API_KEY', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('PAGESPEED_API_KEY');
  });

  test('command documents the 5 workflow steps', () => {
    const content = readPreset(commandPath);
    expect(content).toContain('Pre-flight');
    expect(content).toContain('Collect');
    expect(content).toContain('Analyze');
    expect(content).toContain('Prioritize');
    expect(content).toContain('Report');
  });
});

// ─── Agent Contract Updates ──────────────────────────────────────────────────

describe('agent contract updates', () => {
  test('presets/claude/CLAUDE.md references pagespeed-perf skill', () => {
    const content = readPreset('presets/claude/CLAUDE.md');
    expect(content).toContain('pagespeed-perf');
    expect(content).toContain('.claude/skills/pagespeed-perf/SKILL.md');
  });

  test('presets/codex/AGENTS.md includes PageSpeed trigger phrase', () => {
    const content = readPreset('presets/codex/AGENTS.md');
    expect(content).toContain('PageSpeed');
    expect(content).toContain('PageSpeed audit');
  });
});

// ─── Documentation ───────────────────────────────────────────────────────────

describe('documentation updates', () => {
  test('README.md mentions /cc-pagespeed command', () => {
    const content = readPreset('README.md');
    expect(content).toContain('cc-pagespeed');
  });

  test('README.md documents PAGESPEED_API_KEY requirement', () => {
    const content = readPreset('README.md');
    expect(content).toContain('PAGESPEED_API_KEY');
  });

  test('CHANGELOG.md has pagespeed-perf in Unreleased section', () => {
    const content = readPreset('CHANGELOG.md');
    const unreleasedIndex = content.indexOf('## Unreleased');
    const nextSectionIndex = content.indexOf('\n## [', unreleasedIndex + 1);
    const unreleasedSection = content.slice(unreleasedIndex, nextSectionIndex);
    expect(unreleasedSection).toContain('pagespeed-perf');
  });

  test('docs/cc-commands.md has cc-pagespeed section', () => {
    const content = readPreset('docs/cc-commands.md');
    expect(content).toContain('cc-pagespeed');
    expect(content).toContain('PAGESPEED_API_KEY');
  });

  test('docs/pagespeed-usage.md exists as standalone usage guide', () => {
    expect(existsSync(join(PROJECT_ROOT, 'docs/pagespeed-usage.md'))).toBe(true);
  });

  test('docs/pagespeed-usage.md documents PAGESPEED_API_KEY acquisition steps', () => {
    const content = readPreset('docs/pagespeed-usage.md');
    expect(content).toContain('PAGESPEED_API_KEY');
    expect(content).toContain('developers.google.com/speed');
    expect(content).toContain('CrUX');
  });

  test('docs/pagespeed-usage.md documents all supported environments', () => {
    const content = readPreset('docs/pagespeed-usage.md');
    expect(content).toContain('Claude Code');
    expect(content).toContain('OpenCode');
    expect(content).toContain('Codex');
  });

  test('docs/pagespeed-usage.md includes Core Web Vitals thresholds table', () => {
    const content = readPreset('docs/pagespeed-usage.md');
    expect(content).toContain('LCP');
    expect(content).toContain('CLS');
    expect(content).toContain('TBT');
  });

  test('docs/pagespeed-usage.md includes security notes section', () => {
    const content = readPreset('docs/pagespeed-usage.md');
    expect(content).toContain('Security');
    expect(content).toContain('SSRF');
  });
});
