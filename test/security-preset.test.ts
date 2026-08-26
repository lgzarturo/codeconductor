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

const SKILL_IDS = [
  'security-recon',
  'security-vuln-assessment',
  'security-exploit-dev',
  'security-reverse-engineering',
  'security-malware-analysis',
  'security-threat-hunting',
  'security-incident-response',
  'security-network',
  'security-web',
  'security-cloud',
  'security-soc-automation',
  'security-log-analysis',
  'security-crypto',
  'security-red-team',
  'security-blue-team',
  'security-ai-llm',
  'security-mobile',
  'security-ot-ics',
  'security-grc',
];

const TARGETS = ['claude', 'opencode', 'cursor'] as const;

// ─── SKILL.md files — existence and frontmatter ────────────────────────────

describe('security skills — file existence across targets', () => {
  for (const id of SKILL_IDS) {
    for (const target of TARGETS) {
      test(`presets/${target}/skills/${id}/SKILL.md exists`, () => {
        expect(existsSync(join(PROJECT_ROOT, `presets/${target}/skills/${id}/SKILL.md`))).toBe(
          true,
        );
      });
    }
  }
});

describe('security skills — frontmatter and authorization contract', () => {
  for (const id of SKILL_IDS) {
    for (const target of TARGETS) {
      const path = `presets/${target}/skills/${id}/SKILL.md`;

      test(`${path} has valid YAML frontmatter declaring name: ${id}`, () => {
        const content = readPreset(path);
        expect(hasFrontmatter(content)).toBe(true);
        expect(frontmatterClosed(content)).toBe(true);
        expect(content).toContain(`name: ${id}`);
        expect(content).toContain('description:');
      });

      test(`${path} documents an authorization/scope disclaimer`, () => {
        const content = readPreset(path);
        expect(content).toMatch(/authoriz/i);
      });

      test(`${path} includes usable example prompts`, () => {
        const content = readPreset(path);
        expect(content).toMatch(/## How to Use/i);
      });
    }
  }
});

describe('security skills — content is target-agnostic (verbatim copies)', () => {
  for (const id of SKILL_IDS) {
    test(`${id} SKILL.md is identical across claude, opencode, and cursor`, () => {
      const claude = readPreset(`presets/claude/skills/${id}/SKILL.md`);
      const opencode = readPreset(`presets/opencode/skills/${id}/SKILL.md`);
      const cursor = readPreset(`presets/cursor/skills/${id}/SKILL.md`);

      expect(opencode).toBe(claude);
      expect(cursor).toBe(claude);
    });
  }
});

// ─── /cc:security command files ────────────────────────────────────────────

describe('cc-security command — Claude', () => {
  const commandPath = 'presets/claude/commands/cc/security.md';

  test('command file exists', () => {
    expect(existsSync(join(PROJECT_ROOT, commandPath))).toBe(true);
  });

  test('command requests objective, domain, authorization, risk, and scope', () => {
    const content = readPreset(commandPath);
    expect(content).toMatch(/domain/i);
    expect(content).toMatch(/authorization/i);
    expect(content).toMatch(/risk/i);
    expect(content).toMatch(/scope/i);
  });

  test('command defines low vs medium/high risk routing with Reviewer step', () => {
    const content = readPreset(commandPath);
    expect(content).toMatch(/low-risk/i);
    expect(content).toMatch(/medium|high/i);
    expect(content).toContain('Reviewer');
  });

  test('command requires human confirmation of the Task Card before proceeding', () => {
    const content = readPreset(commandPath);
    expect(content).toMatch(/STOP/);
  });
});

describe('cc-security command — Cursor mirrors Claude', () => {
  test('presets/cursor/commands/cc/security.md is identical to the Claude command', () => {
    const claude = readPreset('presets/claude/commands/cc/security.md');
    const cursor = readPreset('presets/cursor/commands/cc/security.md');
    expect(cursor).toBe(claude);
  });
});

describe('cc-security command — OpenCode', () => {
  const commandPath = 'presets/opencode/commands/cc-security.md';

  test('command file exists', () => {
    expect(existsSync(join(PROJECT_ROOT, commandPath))).toBe(true);
  });

  test('command has YAML frontmatter with description', () => {
    const content = readPreset(commandPath);
    expect(hasFrontmatter(content)).toBe(true);
    expect(content).toContain('description:');
  });

  test('command requests domain, authorization, and risk', () => {
    const content = readPreset(commandPath);
    expect(content).toMatch(/domain/i);
    expect(content).toMatch(/authorization/i);
    expect(content).toMatch(/risk/i);
  });
});

// ─── Agent contract updates ─────────────────────────────────────────────────

describe('agent contract updates reference the new security skills', () => {
  const claudeMdPaths = ['CLAUDE.md', '.claude/CLAUDE.md', 'presets/claude/CLAUDE.md'];

  for (const path of claudeMdPaths) {
    test(`${path} maps security work to the security-* skills`, () => {
      const content = readPreset(path);
      expect(content).toContain('.claude/skills/security-');
    });
  }
});

// ─── Documentation ───────────────────────────────────────────────────────────

describe('documentation updates', () => {
  test('docs/cc-commands.md documents /cc-security', () => {
    const content = readPreset('docs/cc-commands.md');
    expect(content).toMatch(/\/cc[-:]security/);
  });

  test('CHANGELOG.md records the security command under Unreleased', () => {
    const content = readPreset('CHANGELOG.md');
    expect(content).toMatch(/security/i);
  });
});
