import { describe, expect, test } from 'bun:test';
import { renderUsageGuide } from '../../../src/cli/usage-guide';

describe('renderUsageGuide', () => {
  test('uses the resolved bin instead of a hardcoded prefix', () => {
    const guide = renderUsageGuide('bun run dev');
    expect(guide).toContain('bun run dev install preset --target claude');
    expect(guide).toContain('bun run dev setup --target claude');
    expect(guide).not.toContain('npx cc-codeconductor');
  });

  test('covers install preset examples: target, global, force, dry-run, all, locale, combined', () => {
    const guide = renderUsageGuide('npx cc-codeconductor');
    expect(guide).toContain('npx cc-codeconductor install preset --target claude');
    expect(guide).toContain('npx cc-codeconductor install preset --target claude --global');
    expect(guide).toContain('npx cc-codeconductor install preset --target claude --force');
    expect(guide).toContain('npx cc-codeconductor install preset --target claude --dry-run');
    expect(guide).toContain('npx cc-codeconductor install preset --target all');
    expect(guide).toContain('npx cc-codeconductor install preset --target claude --locale es');
    expect(guide).toContain('npx cc-codeconductor install preset --target claude --global --force');
  });

  test('covers install council examples without --locale', () => {
    const guide = renderUsageGuide('npx cc-codeconductor');
    expect(guide).toContain('npx cc-codeconductor install council --target claude');
    expect(guide).toContain('npx cc-codeconductor install council --target claude --global');
    expect(guide).toContain('npx cc-codeconductor install council --target all');

    const councilSection = guide.slice(guide.indexOf('install council —'), guide.indexOf('install lsp —'));
    expect(councilSection).not.toContain('--locale');
  });

  test('covers install lsp examples and documents the pi gap', () => {
    const guide = renderUsageGuide('npx cc-codeconductor');
    expect(guide).toContain('npx cc-codeconductor install lsp --target claude --lang typescript,python');
    expect(guide).toContain('npx cc-codeconductor install lsp --target all --lang typescript,python');
    expect(guide).toContain('npx cc-codeconductor install lsp --target claude --global');
    expect(guide).toContain('npx cc-codeconductor install lsp --target claude --dry-run');
    expect(guide).toMatch(/opencode, claude, codex, gemini, cursor, agy/);
    expect(guide).toMatch(/pi installs the language servers but does not get a dedicated integration config/);
  });

  test('covers the post-install verification loop', () => {
    const guide = renderUsageGuide('npx cc-codeconductor');
    expect(guide).toContain('npx cc-codeconductor doctor');
    expect(guide).toContain('npx cc-codeconductor status');
    expect(guide).toContain('npx cc-codeconductor update --dry-run');
    expect(guide).toContain('npx cc-codeconductor update --force');
    expect(guide).toContain('npx cc-codeconductor migrate --dry-run');
  });

  test('points to the detailed GitHub-only docs', () => {
    const guide = renderUsageGuide('npx cc-codeconductor');
    expect(guide).toContain('docs/usage-cli.md');
    expect(guide).toContain('docs/getting-started/');
  });
});
