import { formatUsage, resolveCliBin } from '../utils/cli-bin';

const RECOMMENDED_FLOW: readonly string[] = [
  'cc-codeconductor setup --target claude',
  'cc-codeconductor setup --target claude --locale es --yes',
  'cc-codeconductor setup --target claude --dry-run',
];

const PRIMITIVES: readonly string[] = [
  'cc-codeconductor detect',
  'cc-codeconductor init --locale es',
  'cc-codeconductor install preset --target claude',
  'cc-codeconductor install council --target claude',
  'cc-codeconductor install lsp --target claude',
];

const PRESET_EXAMPLES: readonly string[] = [
  'cc-codeconductor install preset --target claude',
  'cc-codeconductor install preset --target claude --global',
  'cc-codeconductor install preset --target claude --force',
  'cc-codeconductor install preset --target claude --dry-run',
  'cc-codeconductor install preset --target all',
  'cc-codeconductor install preset --target claude --locale es',
  'cc-codeconductor install preset --target claude --global --force',
];

const COUNCIL_EXAMPLES: readonly string[] = [
  'cc-codeconductor install council --target claude',
  'cc-codeconductor install council --target claude --global',
  'cc-codeconductor install council --target claude --force',
  'cc-codeconductor install council --target claude --dry-run',
  'cc-codeconductor install council --target all',
  'cc-codeconductor install council --target claude --global --force',
];

const LSP_EXAMPLES: readonly string[] = [
  'cc-codeconductor install lsp --target claude --lang typescript,python',
  'cc-codeconductor install lsp --target all --lang typescript,python',
  'cc-codeconductor install lsp --target claude --global',
  'cc-codeconductor install lsp --target claude --dry-run',
];

const AFTER_INSTALL_EXAMPLES: readonly (readonly [string, string])[] = [
  ['cc-codeconductor doctor', 'validates the installation'],
  ['cc-codeconductor status', 'shows what is installed'],
  ['cc-codeconductor update --dry-run', 'previews reconciliation of managed files after upgrading'],
  ['cc-codeconductor update --force', 'applies reconciliation of managed files after upgrading'],
  ['cc-codeconductor migrate --dry-run', 'previews repair of orphaned artifacts a reinstall cannot fix'],
];

function renderExamples(lines: readonly string[], bin: string): string[] {
  return lines.map((line) => `  ${formatUsage(line, bin)}`);
}

function renderAnnotatedExamples(entries: readonly (readonly [string, string])[], bin: string): string[] {
  return entries.map(([line, description]) => `  ${formatUsage(line, bin)} — ${description}`);
}

/**
 * Render a narrative installation guide: preset/council/lsp examples for the
 * common cases (single target, --global, --force, --dry-run, --target all),
 * plus the post-install verification loop. Complements the compact `help`
 * command index; does not replace it.
 */
export function renderUsageGuide(bin = resolveCliBin()): string {
  return [
    'CodeConductor — installation usage guide',
    '',
    'Recommended flow (one command, installs and configures everything):',
    ...renderExamples(RECOMMENDED_FLOW, bin),
    '',
    'Fine-grained primitives (for scripting or partial installs):',
    ...renderExamples(PRIMITIVES, bin),
    '',
    'Shared flags:',
    '  --target    opencode|claude|codex|gemini|cursor|agy|pi|all (default: opencode)',
    '  --global    Install to the home directory (~/.claude, ~/.opencode, etc.) instead of the project',
    '  --force     Allow overwriting existing files',
    '  --dry-run   Show what would happen without writing files',
    '  --locale    Instruction language for agent files: en (default) | es — install preset only',
    '  --lang      Comma-separated languages to install LSP servers for — install lsp only',
    '  --output    Output mode: human (default) | json',
    '',
    'install preset — agents, prompts, skills, and commands:',
    ...renderExamples(PRESET_EXAMPLES, bin),
    '',
    'install council — generated council spec files:',
    ...renderExamples(COUNCIL_EXAMPLES, bin),
    '',
    'install lsp — language servers:',
    ...renderExamples(LSP_EXAMPLES, bin),
    '  Dedicated integration config is generated for: opencode, claude, codex, gemini, cursor, agy.',
    '  pi installs the language servers but does not get a dedicated integration config file.',
    '',
    'After installing, verify and keep in sync:',
    ...renderAnnotatedExamples(AFTER_INSTALL_EXAMPLES, bin),
    '',
    'More detail (GitHub only, not bundled in the npm package):',
    '  docs/usage-cli.md         Detailed CLI reference, incl. per-target generated files',
    '  docs/getting-started/     Installation, first project, and update walkthroughs',
  ].join('\n');
}
