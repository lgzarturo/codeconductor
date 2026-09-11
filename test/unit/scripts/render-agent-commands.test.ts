import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  bodyFrom,
  descriptionFrom,
  renderCodexSkill,
  renderGeminiToml,
  rewriteCodexCrossReferences,
  rewriteTaskToolInvocation,
} from '../../../scripts/render-agent-commands';
import { WORKFLOW_COMMANDS } from '../../../src/core/presets/workflow-commands';

const ROOT = resolve(import.meta.dir, '../../..');

/** Reproduces readNormalizedSource's CRLF→LF normalization on an inline fixture. */
function normalize(md: string): string {
  return md.replace(/\r\n/g, '\n');
}

describe('scripts/render-agent-commands.ts', () => {
  describe('descriptionFrom', () => {
    test('folds a multi-line "[cc: alias] ..." YAML block into one sentence', () => {
      const md = normalize(
        '---\r\ndescription: >-\r\n  [cc: alias] Run the thing — does X,\r\n  Y, and Z.\r\n---\r\n\r\n# Heading\r\n'
      );
      expect(descriptionFrom(md, 'thing')).toBe('Run the thing — does X, Y, and Z.');
    });

    test('folds a single-line description with no [cc: alias] marker', () => {
      const md = normalize('---\r\ndescription: Council-driven workflow with CCEP-1 bootstrap\r\n---\r\n\r\nBody\r\n');
      expect(descriptionFrom(md, 'council')).toBe('Council-driven workflow with CCEP-1 bootstrap');
    });

    test('falls back to a generic description when there is no frontmatter fence', () => {
      const md = '# No frontmatter here\n\nJust body text.\n';
      expect(descriptionFrom(md, 'pagespeed')).toBe('CodeConductor pagespeed workflow');
    });

    test('falls back to a generic description when the folded value is empty', () => {
      const md = '---\ndescription:\n---\n\nBody\n';
      expect(descriptionFrom(md, 'empty')).toBe('CodeConductor empty workflow');
    });
  });

  describe('bodyFrom', () => {
    test('strips the frontmatter block and leaves the body untouched', () => {
      const md = normalize('---\r\ndescription: >-\r\n  [cc: alias] X\r\n---\r\n\r\n# Heading\r\n\r\nBody text.\r\n');
      expect(bodyFrom(md)).toBe('# Heading\n\nBody text.');
    });

    test('returns the input unchanged when there is no frontmatter fence to strip', () => {
      const md = '# No frontmatter\n\nBody.\n';
      expect(bodyFrom(md)).toBe('# No frontmatter\n\nBody.');
    });
  });

  describe('rewriteCodexCrossReferences', () => {
    test('rewrites a named cross-reference to the $cc- spelling', () => {
      expect(rewriteCodexCrossReferences('Delegates to the `/cc:tdd-cycle` state machine.')).toBe(
        'Delegates to the `$cc-tdd-cycle` state machine.'
      );
    });

    test('rewrites the bare `/cc:` self-reference form', () => {
      expect(rewriteCodexCrossReferences('Report the next `/cc:` command.')).toBe(
        'Report the next `$cc-` command.'
      );
    });

    test('rewrites every occurrence, including several in one line', () => {
      expect(
        rewriteCodexCrossReferences('Recommend `/cc:feature` or `/cc:fix` if the spike should become real work.')
      ).toBe('Recommend `$cc-feature` or `$cc-fix` if the spike should become real work.');
    });

    test('leaves non-backtick-wrapped colon syntax untouched', () => {
      // Only the exact `/cc:name` pattern (as authored throughout the
      // cursor source) is rewritten — this is not a general colon-to-hyphen
      // text transform.
      expect(rewriteCodexCrossReferences('See /cc:feature in the docs.')).toBe('See /cc:feature in the docs.');
    });
  });

  describe('rewriteTaskToolInvocation', () => {
    test('rewrites the single-role form for gemini, pointing at its own agent file', () => {
      expect(
        rewriteTaskToolInvocation('Invoke the `architect` subagent via the Task tool.', 'gemini')
      ).toBe('Adopt the `architect` role as defined in `.gemini/agents/architect.md`.');
    });

    test('rewrites the single-role form for codex, pointing at the monolithic AGENTS.md', () => {
      expect(
        rewriteTaskToolInvocation('Invoke the `architect` subagent via the Task tool.', 'codex')
      ).toBe('Adopt the `architect` role as defined in `AGENTS.md`.');
    });

    test('preserves a lowercase mid-sentence "invoke"', () => {
      expect(
        rewriteTaskToolInvocation(
          'Then invoke the `repo-explorer` subagent via the Task tool to map modules.',
          'codex'
        )
      ).toBe('Then adopt the `repo-explorer` role as defined in `AGENTS.md` to map modules.');
    });

    test('rewrites the two-role "X then Y" form', () => {
      expect(
        rewriteTaskToolInvocation('Invoke `contract-builder` then `architect` via the Task tool.', 'gemini')
      ).toBe(
        'Adopt the `contract-builder` role as defined in `.gemini/agents/contract-builder.md`, ' +
          'then the `architect` role as defined in `.gemini/agents/architect.md`.'
      );
    });

    test('leaves text with no Task tool mention untouched', () => {
      expect(rewriteTaskToolInvocation('Run the tests and report the result.', 'gemini')).toBe(
        'Run the tests and report the result.'
      );
    });
  });

  describe('renderGeminiToml', () => {
    test('produces the expected TOML with $ARGUMENTS rewritten to {{args}}', () => {
      const md = normalize(
        '---\r\ndescription: >-\r\n  [cc: alias] Do the thing.\r\n---\r\n\r\n# Thing\r\n\r\nRequest: $ARGUMENTS\r\n'
      );
      expect(renderGeminiToml('thing', md)).toBe(
        'description = "Do the thing."\n\nprompt = """\n# Thing\n\nRequest: {{args}}\n"""\n'
      );
    });

    test('escapes backslashes and closing triple-quotes in the body', () => {
      const md = '---\ndescription: Has odd chars\n---\n\nA \\ backslash and a """ sequence.\n';
      const toml = renderGeminiToml('odd', md);
      expect(toml).toContain('A \\\\ backslash');
      expect(toml).toContain("a ''' sequence");
    });
  });

  describe('renderCodexSkill', () => {
    test('produces the expected SKILL.md and rewrites the self-reference spelling', () => {
      const md = normalize(
        '---\r\ndescription: >-\r\n  [cc: alias] Do the thing.\r\n---\r\n\r\n# Thing\r\n\r\n4. Next command spelling on this runner: `/cc:thing`\r\n'
      );
      expect(renderCodexSkill('thing', md)).toBe(
        '---\nname: cc-thing\ndescription: Do the thing.\n---\n\n' +
          '# thing\n\nInvoke as `$cc-thing`. The user request follows the skill mention.\n\n' +
          '# Thing\n\n4. Next command spelling on this runner: `$cc-thing`\n'
      );
    });
  });

  describe('generated Gemini/Codex commands never mention the Task tool', () => {
    // Neither runner has one (src/presets/targets/{gemini,codex}.yml). Left
    // unrewritten, the model is told to use a tool that does not exist for it.
    for (const cmd of WORKFLOW_COMMANDS) {
      test(`${cmd}: no "Task tool" mention in either rendered artifact`, async () => {
        const toml = await readFile(join(ROOT, 'presets/gemini/commands/cc', `${cmd}.toml`), 'utf-8');
        const skill = await readFile(join(ROOT, 'presets/codex/skills', `cc-${cmd}`, 'SKILL.md'), 'utf-8');
        expect(toml).not.toContain('Task tool');
        expect(skill).not.toContain('Task tool');
      });
    }
  });
});
