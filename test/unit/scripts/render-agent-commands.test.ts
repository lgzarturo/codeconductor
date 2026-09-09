import { describe, expect, test } from 'bun:test';
import {
  bodyFrom,
  descriptionFrom,
  renderCodexSkill,
  renderGeminiToml,
  rewriteCodexCrossReferences,
} from '../../../scripts/render-agent-commands';

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
});
