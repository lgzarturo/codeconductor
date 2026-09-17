import packageJson from '../../package.json';
import { formatUsage, resolveCliBin } from '../utils/cli-bin';

export type CommandGroup = 'getting-started' | 'maintenance' | 'workflow' | 'tool';

export interface CommandDefinition {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly group: CommandGroup;
  readonly summary: string;
  readonly usage: readonly string[];
  readonly options?: readonly string[];
  readonly subcommands?: readonly CommandDefinition[];
}

export const COMMANDS: readonly CommandDefinition[] = [
  { name: 'setup', group: 'getting-started', summary: 'Configure and install CodeConductor.', usage: ['cc-codeconductor setup [--target <target>] [--locale en|es] [--yes] [--dry-run]'] },
  { name: 'detect', group: 'getting-started', summary: 'Inspect the project stack and recommended presets.', usage: ['cc-codeconductor detect'] },
  { name: 'init', group: 'getting-started', summary: 'Initialize low-level CodeConductor configuration.', usage: ['cc-codeconductor init [--locale en|es]'] },
  { name: 'install', group: 'getting-started', summary: 'Install harness components.', usage: ['cc-codeconductor install preset --target <target>'], options: ['--target opencode|claude|codex|gemini|cursor|agy|pi|all'], subcommands: [
    { name: 'preset', group: 'getting-started', summary: 'Install agents, prompts, skills, and commands.', usage: ['cc-codeconductor install preset --target <target> [--locale en|es]'] },
    { name: 'council', group: 'getting-started', summary: 'Install generated council files.', usage: ['cc-codeconductor install council --target <target>'] },
    { name: 'lsp', group: 'getting-started', summary: 'Install supported language servers.', usage: ['cc-codeconductor install lsp --target <target> [--lang typescript,python]'] },
  ] },
  { name: 'version', group: 'maintenance', summary: 'Show CLI and project harness versions.', usage: ['cc-codeconductor version [--json]'] },
  { name: 'status', group: 'maintenance', summary: 'Show installed harness state.', usage: ['cc-codeconductor status [--json]'] },
  { name: 'doctor', group: 'maintenance', summary: 'Diagnose the installation.', usage: ['cc-codeconductor doctor'] },
  { name: 'update', group: 'maintenance', summary: 'Safely reconcile managed harness files.', usage: ['cc-codeconductor update [--dry-run] [--force]'] },
  { name: 'migrate', group: 'maintenance', summary: 'Apply compatibility migrations.', usage: ['cc-codeconductor migrate [--dry-run]'] },
  { name: 'docs', group: 'maintenance', summary: 'Read bundled command documentation.', usage: ['cc-codeconductor docs [command]'] },
  { name: 'completion', group: 'maintenance', summary: 'Generate shell completion.', usage: ['cc-codeconductor completion <bash|zsh|fish|powershell>'] },
  { name: 'hook', group: 'maintenance', summary: 'Run installed agent hooks.', usage: ['cc-codeconductor hook <pre-tool|post-tool|session-start>'] },
  { name: 'cc-help', group: 'maintenance', summary: 'Show a target preset inventory.', usage: ['cc-codeconductor cc-help --target <target>'] },
  { name: 'ask', group: 'workflow', summary: 'Recommend a slash-command workflow.', usage: ['cc-codeconductor ask "problem"'] },
  { name: 'goal', aliases: ['cc-goal'], group: 'workflow', summary: 'Plan a goal into dependent tasks.', usage: ['cc-codeconductor goal "objective"'] },
  { name: 'ingest', group: 'workflow', summary: 'Ingest repository knowledge into the product graph.', usage: ['cc-codeconductor ingest'] },
  { name: 'product', group: 'workflow', summary: 'Explore the product graph and memory.', usage: ['cc-codeconductor product <subcommand>'] },
  { name: 'ccep', group: 'workflow', summary: 'Run CCEP contract workflows.', usage: ['cc-codeconductor ccep <subcommand>'] },
  { name: 'openspec', group: 'workflow', summary: 'Run the OpenSpec delivery loop.', usage: ['cc-codeconductor openspec <subcommand>'] },
  { name: 'scorecard', group: 'workflow', summary: 'Record and aggregate outcomes.', usage: ['cc-codeconductor scorecard <subcommand>'] },
  { name: 'orchestrate', group: 'workflow', summary: 'Run goal execution orchestration.', usage: ['cc-codeconductor orchestrate <subcommand>'] },
  { name: 'impact', group: 'workflow', summary: 'Analyze change impact.', usage: ['cc-codeconductor impact [--files <paths>]'] },
  { name: 'verify', group: 'workflow', summary: 'Verify task completion with evidence.', usage: ['cc-codeconductor verify --task <id>'] },
  { name: 'rdd', group: 'workflow', summary: 'Capture and validate Receipt-Driven Development evidence.', usage: ['cc-codeconductor rdd capture --task <id> [--phase red|green|review]', 'cc-codeconductor rdd verify --receipt <id>', 'cc-codeconductor rdd status [--task <id>]', 'cc-codeconductor rdd git-check', 'cc-codeconductor rdd install-hooks'] },
  { name: 'seo', group: 'tool', summary: 'Audit SEO and generate llms.txt.', usage: ['cc-codeconductor seo audit --url <url>'] },
  { name: 'debt-harvest', aliases: ['harvest'], group: 'tool', summary: 'Scan source files for deferred debt.', usage: ['cc-codeconductor debt-harvest'] },
];

const GROUP_LABELS: Record<CommandGroup, string> = {
  'getting-started': 'GETTING STARTED', maintenance: 'MAINTENANCE', workflow: 'WORKFLOWS', tool: 'TOOLS',
};

export function findCommand(name?: string, subcommand?: string): CommandDefinition | undefined {
  const command = COMMANDS.find((candidate) => candidate.name === name || candidate.aliases?.includes(name ?? ''));
  return subcommand ? command?.subcommands?.find((candidate) => candidate.name === subcommand) : command;
}

export function renderHelp(command?: string, subcommand?: string, all = false, bin = resolveCliBin()): string {
  const definition = findCommand(command, subcommand);
  if (definition) {
    return [
      `CodeConductor — ${subcommand ? `${command} ${subcommand}` : definition.name}`,
      '', definition.summary, '', 'Usage:', ...definition.usage.map((usage) => `  ${formatUsage(usage, bin)}`),
      ...(definition.options?.length ? ['', 'Options:', ...definition.options.map((option) => `  ${option}`)] : []),
      ...(definition.subcommands?.length ? ['', 'Subcommands:', ...definition.subcommands.map((item) => `  ${item.name.padEnd(12)} ${item.summary}`)] : []),
      '', `Run \`${bin} help --all\` for every command.`,
    ].join('\n');
  }
  const grouped = (Object.keys(GROUP_LABELS) as CommandGroup[]).flatMap((group) => [
    GROUP_LABELS[group],
    ...COMMANDS.filter((item) => item.group === group).map((item) => `  ${[item.name, ...(item.aliases ?? [])].join(' / ').padEnd(14)} ${item.summary}`),
    '',
  ]);
  const details = all
    ? COMMANDS.flatMap((item) => [
      `## ${item.name}`, ...item.usage.map((usage) => `  ${formatUsage(usage, bin)}`),
      ...(item.subcommands?.map((sub) => `  ${item.name} ${sub.name} — ${sub.summary}`) ?? []), '',
    ])
    : [];
  return [`CodeConductor CLI v${packageJson.version}`, '', `Usage: ${bin} <command> [options]`, '', ...grouped, ...details, `Run \`${bin} help <command>\` for details.`].join('\n');
}

export function renderDocs(command?: string, bin = 'cc-codeconductor'): string {
  const groupAliases: Record<string, CommandGroup> = {
    'getting-started': 'getting-started', maintenance: 'maintenance', workflow: 'workflow', workflows: 'workflow', tool: 'tool', tools: 'tool',
  };
  const definitions = command
    ? groupAliases[command]
      ? COMMANDS.filter((item) => item.group === groupAliases[command])
      : [findCommand(command)].filter((item): item is CommandDefinition => Boolean(item))
    : COMMANDS;
  return ['# CodeConductor CLI', '', ...definitions.flatMap((item) => [
    `## ${item.name}`, '', item.summary, '', '```text', ...item.usage.map((usage) => formatUsage(usage, bin)), '```', '',
  ])].join('\n');
}

export function renderCompletion(shell: string): string | null {
  const names = COMMANDS.flatMap((item) => [item.name, ...(item.aliases ?? [])]).join(' ');
  const targets = 'opencode claude codex gemini cursor agy pi all';
  if (shell === 'bash') return `_cc(){ local cur="${'${COMP_WORDS[COMP_CWORD]}'}"; local prev="${'${COMP_WORDS[COMP_CWORD-1]}'}"; if [[ "$prev" == "--target" ]]; then COMPREPLY=( $(compgen -W "${targets}" -- "$cur") ); else COMPREPLY=( $(compgen -W "${names}" -- "$cur") ); fi; }\ncomplete -F _cc cc-codeconductor codeconductor cc`;
  if (shell === 'zsh') return `#compdef cc-codeconductor codeconductor cc\n_arguments '1:command:(${names})' '--target[target]:target:(${targets})'`;
  if (shell === 'fish') return [
    ...['cc-codeconductor', 'codeconductor', 'cc'].flatMap((bin) => [
      ...COMMANDS.map((item) => `complete -c ${bin} -a ${item.name} -d '${item.summary}'`),
      `complete -c ${bin} -l target -a '${targets}'`,
    ]),
  ].join('\n');
  if (shell === 'powershell') return `Register-ArgumentCompleter -CommandName cc-codeconductor,codeconductor,cc -ScriptBlock { param($wordToComplete,$commandAst,$cursorPosition) $values = if ($commandAst.ToString() -match '--target\\s+$') { '${targets}' } else { '${names}' }; $values.Split(' ') | Where-Object { $_ -like "$wordToComplete*" } }`;
  return null;
}
