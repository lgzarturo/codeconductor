import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const PROJECT_ROOT = process.cwd();

describe('tracked skills', () => {
  test('.agents council skill has YAML frontmatter for Codex skill loading', () => {
    const skillPath = join(PROJECT_ROOT, '.agents', 'skills', 'council', 'SKILL.md');

    expect(existsSync(skillPath)).toBe(true);

    const content = readFileSync(skillPath, 'utf-8');
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain('\nname: council\n');
    expect(content).toContain('\ndescription: Multi-agent council for code review and architecture decisions\n');
    expect(content.indexOf('\n---\n')).toBeGreaterThan(0);
  });
});
