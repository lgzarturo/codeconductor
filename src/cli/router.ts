import packageJson from '../../package.json';
import { z } from 'zod';
import type { DetectOptions } from '../commands/detect.command';
import type { DoctorOptions } from '../commands/doctor.command';
import type { InitOptions } from '../commands/init.command';
import type { InstallOptions, InstallPresetOptions } from '../commands/install.command';
import type { InstallLspOptions } from '../commands/install-lsp.command';
import type { DebtHarvestOptions } from '../commands/debt-harvest.command';
import type { GoalOptions } from '../commands/goal.command';
import type { CcepOptions } from '../commands/ccep.command';
import type { OpenspecOptions } from '../commands/openspec.command';
import type { ScorecardOptions } from '../commands/scorecard.command';
import type { HelpOptions } from '../commands/help.command';
import type { SeoAuditOptions, SeoLlmsOptions } from '../domain/seo/seo-types';
import type { UpdateOptions } from '../commands/update.command';
import type { IngestOptions } from '../commands/ingest.command';
import type { ProductOptions } from '../commands/product.command';
import type { OrchestrateOptions } from '../commands/orchestrate.command';
import type { ImpactOptions } from '../commands/impact.command';
import type { VerifyOptions } from '../commands/verify.command';
import type { AskOptions } from '../commands/ask.command';
import type { OutputMode } from '../utils/logger';

/**
 * Parsed CLI arguments
 */
export interface CliArgs {
  command: string;
  subcommand?: string;
  options: Record<string, unknown>;
  flags: {
    help: boolean;
    version: boolean;
    dryRun: boolean;
    force: boolean;
    output: OutputMode;
  };
  rest?: string[];
  validationErrors?: string[];
}

const OutputModeSchema = z.enum(['json', 'human']);
const SeoFormatSchema = z.enum(['cli', 'json', 'markdown']);
const SeoFailOnSchema = z.enum(['error', 'warning', 'never']);
const NonNegativeIntegerSchema = z.coerce.number().int().nonnegative();

/**
 * Parse command from args
 */
export function parseArgs(args: string[]): CliArgs {
  const commandAcceptsOutputPath = args[0] === 'seo';
  const flags = {
    help: false,
    version: false,
    dryRun: false,
    force: false,
    output: 'human' as OutputMode,
  };

  const options: Record<string, unknown> = {};
  const validationErrors: string[] = [];

  // First pass: collect flags
  const remaining: string[] = [];
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--force') {
      flags.force = true;
    } else if (arg === '--output' || arg === '-o') {
      // Will be handled in next iteration
      remaining.push(arg);
    } else if (arg.startsWith('--output=') || arg.startsWith('-o=')) {
      const value = arg.split('=')[1];
      const parsed = OutputModeSchema.safeParse(value);
      if (parsed.success) {
        flags.output = parsed.data;
      } else if (commandAcceptsOutputPath) {
        remaining.push(arg);
      } else {
        validationErrors.push(`Invalid --output: ${value}. Expected json or human.`);
      }
    } else {
      remaining.push(arg);
    }
  }

  // Handle --output -o value
  for (let i = 0; i < remaining.length; i++) {
    if ((remaining[i] === '--output' || remaining[i] === '-o') && remaining[i + 1]) {
      const value = remaining[i + 1];
      const parsed = OutputModeSchema.safeParse(value);
      if (parsed.success) {
        flags.output = parsed.data;
        remaining.splice(i, 2);
        i--;
      } else if (!commandAcceptsOutputPath) {
        validationErrors.push(`Invalid --output: ${value}. Expected json or human.`);
        remaining.splice(i, 2);
        i--;
      } else {
        // SEO also owns --output as a report path; leave it for option parsing.
      }
    }
  }

  // Remaining first arg is command, second (non-flag) is optional subcommand
  const command = remaining[0] || 'help';
  const subcommand = remaining[1] && !remaining[1].startsWith('-') ? remaining[1] : undefined;

  // Parse remaining args for options
  const consumed = new Set<number>();
  for (let i = 1; i < remaining.length; i++) {
    const arg = remaining[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (key === 'lang') {
        // Parse comma-separated values for --lang
        const langValue = value !== undefined ? value : remaining[++i];
        consumed.add(i);
        if (langValue && typeof langValue === 'string') {
          options[key] = langValue.split(',').map((s) => s.trim());
        }
      } else if (value !== undefined) {
        options[key] = value;
        consumed.add(i);
      } else if (remaining[i + 1] && !remaining[i + 1].startsWith('-')) {
        options[key] = remaining[++i];
        consumed.add(i - 1);
        consumed.add(i);
      } else {
        options[key] = true;
        consumed.add(i);
      }
    }
  }

  const rest: string[] = [];
  const startIdx = subcommand ? 2 : 1;
  for (let i = startIdx; i < remaining.length; i++) {
    if (!consumed.has(i) && !remaining[i].startsWith('-')) {
      rest.push(remaining[i]);
    }
  }

  return {
    command,
    subcommand,
    options,
    flags,
    rest,
    validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
  };
}

/**
 * Get version text
 */
export function getVersion(): string {
  return `${packageJson.name} v${packageJson.version}`;
}

/**
 * Get help text
 */
export function getHelp(): string {
  return `CodeConductor CLI v${packageJson.version}

Usage: npx cc-codeconductor <command> [options]

Published commands (package ${packageJson.version}):
  init                    Initialize CodeConductor in a project
  detect                  Detect project stack and recommended presets
  install council         Install generated council spec files to runner targets
  install preset          Install full preset (agents, prompts, skills, commands)
  install lsp             Install and configure LSP servers for AI coding tools
  seo audit               Run SEO audit on a URL or sitemap
  seo llms                Generate llms.txt from a URL or sitemap
  doctor                  Validate configuration and generated files
  update                  Update installed presets
  help                    Show general CLI usage and command list
  ask                     Recommend a /cc: slash command from a natural-language problem
  cc-help                 Show preset inventory (skills, subagents, commands)
  debt-harvest / harvest  Scan source files for deferred debt items
  ccep                    CCEP contracts: parse/profile/validate/evaluate/consensus/taskcard
  openspec                OpenSpec loop: validate/scan/plan/status/next/start/done/block/archive
  scorecard               Record and aggregate evaluation outcomes
                          (catalog / fingerprint / experiment / ablation)

v1.0.0 (in this repo, not in published ${packageJson.version}):
  goal / cc-goal          Plan goal into task graph with dependencies
  ingest                  Ingest repo knowledge into product graph
  product                 Explore product graph and memory
  orchestrate             Runtime orchestrator for goal execution
  impact                  Analyze change impact on product graph
  verify                  Verify task completion with evidence
                          (--allow-compile-check trusts the repo-configured compile command)

Options:
  --help, -h              Show this help message
  --version, -v           Show package version
  --dry-run               Show what would happen without writing files
  --force                 Allow overwriting existing files
  --global                Install to home directory (~/.claude, ~/.opencode, etc.)
  --output, -o            Output mode: human or json
  --lang                  Comma-separated list of languages (e.g., typescript,php,python)
  --locale                Instruction language for agent files: en (default) | es
  --target                Runner target: opencode, claude, codex, gemini, cursor, agy, all

Stack-specific presets (v0.4.0, registered in preset-registry):
  ts-next-drizzle         Next.js / Astro, Tailwind, Drizzle ORM, Bun, Postgres
  spring-kotlin-jpa       Spring Boot, Kotlin/Java, Gradle, JPA, Hibernate
  laravel-tall            Laravel, Blade, Livewire, Alpine.js
  python-data-api         Python, FastAPI, Django, uv
  Listed programmatically via listPresets() in src/core/presets/preset-registry.ts.
  Detection wires matching specialized skills onto the generic target workflow.
  Full stack-specific asset pruning/replacement is not implemented yet.

Orchestration loops:
  CCEP slash commands are the canonical consumer loop (profiles in
  src/core/ccep/). Prefer /cc-iterative, /cc-triage, and /cc-handoff;
  other CCEP commands are supporting profiles.
  OpenSpec is a delivery loop (CLI openspec + /cc-openspec) on top of
  BACKLOG.md — not only a scanner.
  runWorkflowPipeline() in src/core/pipeline/workflow-loop.ts is an
  experimental library-only 8-phase loop — not a shipped CLI runtime.

Council consensus v0.4.0:
  Per-agent confidence thresholds (< 0.6 or average < 0.7 escalate)
  and a complianceVeto channel that overrides majority like securityVeto.

Examples:
  npx cc-codeconductor init
  npx cc-codeconductor init --global
  npx cc-codeconductor init --locale=es
  npx cc-codeconductor detect
  npx cc-codeconductor install preset --target opencode
  npx cc-codeconductor install preset --target claude
  npx cc-codeconductor install preset --target codex
  npx cc-codeconductor install preset --target cursor
  npx cc-codeconductor install preset --target agy
  npx cc-codeconductor install preset --target all
  npx cc-codeconductor install preset --target claude --global
  npx cc-codeconductor install preset --target claude --locale=es
  npx cc-codeconductor install council --target opencode
  npx cc-codeconductor install council --target claude
  npx cc-codeconductor install council --target codex
  npx cc-codeconductor install council --target agy
  npx cc-codeconductor install council --target all
  npx cc-codeconductor install lsp --target opencode
  npx cc-codeconductor install lsp --target all --lang typescript,python
  npx cc-codeconductor install lsp --target claude --dry-run
  npx cc-codeconductor doctor
  npx cc-codeconductor update --dry-run
  npx cc-codeconductor seo audit --url https://example.com
  npx cc-codeconductor seo audit --sitemap https://example.com/sitemap.xml
  npx cc-codeconductor seo audit --sitemap https://example.com/sitemap.xml --format markdown
  npx cc-codeconductor seo llms --sitemap https://example.com/sitemap.xml
  npx cc-codeconductor seo llms --url https://example.com --output llms.txt
  npx cc-codeconductor goal "Add user authentication"
  npx cc-codeconductor cc-goal "Implement CRUD for invoices"
  npx cc-codeconductor ccep parse --command fix "login fails"
  npx cc-codeconductor ccep profile council --output json
  npx cc-codeconductor ccep resolve --command feature "Add CRUD"
  npx cc-codeconductor ccep evaluate --command feature --input @planner.json
  npx cc-codeconductor ccep consensus --input @verdicts.json
  npx cc-codeconductor ccep taskcard --command feature --input @card.json
  npx cc-codeconductor openspec validate
  npx cc-codeconductor openspec scan
  npx cc-codeconductor openspec plan BC-001
  npx cc-codeconductor openspec status
  npx cc-codeconductor openspec next
  npx cc-codeconductor openspec start BC-001-discover
  npx cc-codeconductor openspec done BC-001-discover
  npx cc-codeconductor openspec block BC-001-implement --reason "waiting on design"
  npx cc-codeconductor openspec archive BC-001
  npx cc-codeconductor scorecard create --task BC-001 --from-diff
  npx cc-codeconductor scorecard models
  npx cc-codeconductor scorecard aggregate
  npx cc-codeconductor scorecard catalog
  npx cc-codeconductor scorecard experiment start --suite harness-v1 --components review
  npx cc-codeconductor scorecard ablation --experiment <id>
  npx cc-codeconductor help
  npx cc-codeconductor ask "login fails with 500"
  npx cc-codeconductor cc-help --target opencode
  npx cc-codeconductor cc-help --target claude --output json

Docs: https://github.com/lgzarturo/codeconductor/tree/main/docs
  docs/v0.4.0-release-notes.md   v0.4.0 feature breakdown
  docs/routing-policy.md         Risk-based routing (v0.4.0)
  docs/prompt-versioning.md      Agent contract versions
  docs/usage-cli.md              Detailed CLI reference
`;
}

function cliContractError(command: string, errors: string[]) {
  return {
    code: 1,
    data: {
      success: false,
      command,
      errors,
    },
  };
}

function unknownSubcommand(command: string, subcommand: string, valid: readonly string[]) {
  return cliContractError(command, [
    `Unknown subcommand for ${command}: ${subcommand}. Use: ${valid.join(', ')}`,
  ]);
}

function parseSeoOptions(options: Record<string, unknown>):
  | {
      readonly success: true;
      readonly format?: z.infer<typeof SeoFormatSchema>;
      readonly failOn?: z.infer<typeof SeoFailOnSchema>;
      readonly delay?: number;
    }
  | { readonly success: false; readonly errors: string[] } {
  const errors: string[] = [];
  const format = options.format === undefined
    ? undefined
    : SeoFormatSchema.safeParse(options.format);
  const failOn = options['fail-on'] === undefined
    ? undefined
    : SeoFailOnSchema.safeParse(options['fail-on']);
  const delay = options.delay === undefined
    ? undefined
    : NonNegativeIntegerSchema.safeParse(options.delay);

  if (format && !format.success) {
    errors.push('Invalid --format. Expected cli, json, or markdown.');
  }
  if (failOn && !failOn.success) {
    errors.push('Invalid --fail-on. Expected error, warning, or never.');
  }
  if (delay && !delay.success) {
    errors.push('Invalid --delay. Expected a non-negative integer.');
  }
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return {
    success: true,
    format: format?.data,
    failOn: failOn?.data,
    delay: delay?.data,
  };
}

/**
 * Route command to handler
 */
export async function routeCommand(
  args: CliArgs,
  projectRoot: string
): Promise<{ code: number; data?: unknown }> {
  const { command, subcommand, options, flags } = args;

  if (args.validationErrors?.length) {
    return cliContractError(command, args.validationErrors);
  }

  switch (command) {
    case 'init': {
      const { initCommand } = await import('../commands/init.command');
      return initCommand({
        projectRoot,
        dryRun: flags.dryRun,
        force: flags.force,
        global: options.global === true || options.global === 'true',
        output: flags.output,
        locale: (options.locale === 'es' ? 'es' : 'en') as 'en' | 'es',
      } as InitOptions);
    }

    case 'detect': {
      const { detectCommand } = await import('../commands/detect.command');
      return detectCommand({
        projectRoot,
        output: flags.output,
      } as DetectOptions);
    }

    case 'install': {
      const isGlobal = options.global === true || options.global === 'true';
      const VALID_TARGETS = ['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy', 'all'];
      const VALID_INSTALL_SUBCOMMANDS = ['council', 'preset', 'lsp', ...VALID_TARGETS];

      if (subcommand && !VALID_INSTALL_SUBCOMMANDS.includes(subcommand)) {
        return unknownSubcommand('install', subcommand, VALID_INSTALL_SUBCOMMANDS);
      }
      if (typeof options.target === 'string' && !VALID_TARGETS.includes(options.target)) {
        return cliContractError('install', [
          `Invalid --target: ${options.target}. Expected one of: ${VALID_TARGETS.join(', ')}`,
        ]);
      }

      // If subcommand is a runner name (not a preset name), treat it as --target
      let resolvedSubcommand = subcommand;
      let target = options.target as string;
      if (!target && subcommand && VALID_TARGETS.includes(subcommand)) {
        target = subcommand;
        resolvedSubcommand = undefined;
      }
      target = target || 'opencode';

      if (resolvedSubcommand === 'lsp') {
        const { installLspCommand } = await import('../commands/install-lsp.command');
        return installLspCommand({
          projectRoot,
          target,
          lang: options.lang as string[] | undefined,
          dryRun: flags.dryRun,
          force: flags.force,
          global: isGlobal,
          output: flags.output,
        } as InstallLspOptions);
      }

      const { installCommand, installPresetCommand } = await import('../commands/install.command');
      if (resolvedSubcommand === 'preset') {
        return installPresetCommand({
          projectRoot,
          target,
          dryRun: flags.dryRun,
          force: flags.force,
          global: isGlobal,
          output: flags.output,
          locale: options.locale === 'es' ? 'es' : options.locale === 'en' ? 'en' : undefined,
        } as InstallPresetOptions);
      }

      return installCommand({
        projectRoot,
        target,
        dryRun: flags.dryRun,
        force: flags.force,
        global: isGlobal,
        output: flags.output,
      } as InstallOptions);
    }

    case 'doctor': {
      const { doctorCommand } = await import('../commands/doctor.command');
      return doctorCommand({
        projectRoot,
        output: flags.output,
      } as DoctorOptions);
    }

    case 'update': {
      const { updateCommand } = await import('../commands/update.command');
      return updateCommand({
        projectRoot,
        dryRun: flags.dryRun,
        force: flags.force,
        global: options.global === true || options.global === 'true',
        output: flags.output,
      } as UpdateOptions);
    }

    case 'help':
      return {
        code: 0,
        data: {
          success: true,
          command: 'help',
          help: getHelp(),
        },
      };

    case 'ask': {
      const { askCommand } = await import('../commands/ask.command');
      const problem =
        subcommand && !subcommand.startsWith('-')
          ? [subcommand, ...(args.rest ?? [])].join(' ').trim()
          : (args.rest ?? []).join(' ').trim() || String(options.problem ?? '');
      return askCommand({
        problem,
        output: flags.output,
      } as AskOptions);
    }

    case 'cc-help': {
      const { helpCommand } = await import('../commands/help.command');
      return helpCommand({
        projectRoot,
        target: options.target as string | undefined,
        output: flags.output,
        command: 'cc-help',
      } as HelpOptions);
    }

    case 'debt-harvest':
    case 'harvest': {
      const { debtHarvestCommand } = await import('../commands/debt-harvest.command');
      return debtHarvestCommand({
        projectRoot,
        dir: options.dir as string | undefined,
        output: flags.output,
      } as DebtHarvestOptions);
    }

    case 'goal':
    case 'cc-goal': {
      const { goalCommand } = await import('../commands/goal.command');
      return goalCommand({
        objective: subcommand || (options.objective as string) || args.rest?.join(' ') || '',
        projectRoot,
        output: flags.output,
        product: options.product === true || options.product === 'true',
        dryRun: flags.dryRun,
      } as GoalOptions);
    }

    case 'ingest': {
      const { ingestCommand } = await import('../commands/ingest.command');
      return ingestCommand({
        projectRoot,
        output: flags.output,
      } as IngestOptions);
    }

    case 'product':
    case 'cc-product': {
      const validSubs = ['graph', 'query', 'path', 'timeline', 'memory', 'decisions', 'insights', 'export'];
      if (subcommand && !validSubs.includes(subcommand)) {
        return unknownSubcommand(command, subcommand, validSubs);
      }
      const productSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'graph';
      const queryText = productSub === 'query' ? args.rest?.join(' ') : undefined;
      const pathFrom = productSub === 'path' ? args.rest?.[0] : undefined;
      const pathTo = productSub === 'path' ? args.rest?.[1] : undefined;
      const { productCommand } = await import('../commands/product.command');
      return productCommand({
        subcommand: productSub,
        projectRoot,
        output: flags.output,
        query: queryText,
        from: pathFrom,
        to: pathTo,
        since: options.since as string | undefined,
        format: options.format as string | undefined,
      } as ProductOptions);
    }

    case 'orchestrate':
    case 'cc-orchestrate': {
      const validSubs = ['status', 'next', 'run', 'cycle'];
      if (subcommand && !validSubs.includes(subcommand)) {
        return unknownSubcommand(command, subcommand, validSubs);
      }
      const orchSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'status';
      const { orchestrateCommand } = await import('../commands/orchestrate.command');
      return orchestrateCommand({
        subcommand: orchSub,
        projectRoot,
        output: flags.output,
        taskId: (options.task as string) ?? args.rest?.[0],
        complete: options.complete === true || options.complete === 'true',
        allowCompileCheck:
          options['allow-compile-check'] === true || options['allow-compile-check'] === 'true',
      } as OrchestrateOptions);
    }

    case 'impact':
    case 'cc-impact': {
      const filesOpt = options.files as string | undefined;
      const files = filesOpt ? filesOpt.split(',').map((s) => s.trim()) : args.rest;
      const { impactCommand } = await import('../commands/impact.command');
      return impactCommand({
        projectRoot,
        output: flags.output,
        files: files?.length ? files : undefined,
        node: options.node as string | undefined,
        capability: options.capability as string | undefined,
      } as ImpactOptions);
    }

    case 'verify':
    case 'cc-verify': {
      const { verifyCommand } = await import('../commands/verify.command');
      return verifyCommand({
        projectRoot,
        output: flags.output,
        taskId: (options.task as string) ?? args.rest?.[0] ?? '',
        allowCompileCheck:
          options['allow-compile-check'] === true || options['allow-compile-check'] === 'true',
      } as VerifyOptions);
    }

    case 'ccep': {
      const validSubs = ['parse', 'profile', 'resolve', 'compile', 'validate', 'evaluate', 'consensus', 'taskcard'];
      if (subcommand && !validSubs.includes(subcommand)) {
        return unknownSubcommand('ccep', subcommand, validSubs);
      }
      const ccepSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'parse';
      const workflowCommand = (options.command as string) || undefined;
      const requestParts = args.rest ?? [];
      const userRequest =
        ccepSub === 'profile' && !workflowCommand
          ? requestParts[0]
          : ['compile', 'resolve', 'parse', 'evaluate'].includes(ccepSub)
            ? requestParts.join(' ').trim()
            : requestParts.join(' ').trim();

      const validateRest =
        (ccepSub === 'validate' || ccepSub === 'evaluate' || ccepSub === 'consensus' || ccepSub === 'taskcard') && !options.input
          ? requestParts
          : undefined;

      const { ccepCommand } = await import('../commands/ccep.command');
      return ccepCommand({
        subcommand: ccepSub,
        projectRoot,
        output: flags.output,
        command: workflowCommand,
        userRequest: userRequest || undefined,
        phase: options.phase as string | undefined,
        role: options.role as string | undefined,
        input: options.input as string | undefined,
        contextPath: (options.context as string) || (options.contextPath as string),
        promptVersion: (options['prompt-version'] as string) || (options.promptVersion as string),
        config: options.config as string | undefined,
        rest: validateRest,
      } as CcepOptions);
    }

    case 'openspec':
    case 'cc-openspec': {
      const validSubs = [
        'validate',
        'scan',
        'plan',
        'status',
        'next',
        'start',
        'done',
        'block',
        'archive',
      ];
      let openspecSub = 'validate';
      let itemId: string | undefined = (options.item as string) || undefined;

      if (subcommand && validSubs.includes(subcommand)) {
        openspecSub = subcommand;
        itemId = itemId ?? args.rest?.[0];
      } else if (subcommand && /^BC-\d+$/i.test(subcommand)) {
        openspecSub = 'plan';
        itemId = subcommand;
      } else if (subcommand) {
        return unknownSubcommand(command, subcommand, validSubs);
      }

      const { openspecCommand } = await import('../commands/openspec.command');
      return openspecCommand({
        subcommand: openspecSub,
        itemId,
        reason: typeof options.reason === 'string' ? options.reason : undefined,
        projectRoot,
        output: flags.output,
      } as OpenspecOptions);
    }

    case 'scorecard':
    case 'cc-scorecard': {
      const validSubs = [
        'create',
        'show',
        'record',
        'list',
        'aggregate',
        'models',
        'prompt-diff',
        'regression',
        'matrix',
        'compare-models',
        'catalog',
        'fingerprint',
        'experiment',
        'ablation',
      ];
      if (subcommand && !validSubs.includes(subcommand)) {
        return unknownSubcommand(command, subcommand, validSubs);
      }
      let scorecardSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'aggregate';
      if (!subcommand || !validSubs.includes(subcommand)) {
        scorecardSub = 'aggregate';
      }

      const modelsFilter =
        typeof options.models === 'string'
          ? options.models.split(',').map((s) => s.trim())
          : undefined;

      const { scorecardCommand } = await import('../commands/scorecard.command');
      return scorecardCommand({
        subcommand: scorecardSub,
        projectRoot,
        output: flags.output,
        id:
          scorecardSub === 'show' || scorecardSub === 'ablation'
            ? args.rest?.[0] ?? (options.id as string)
            : (options.id as string),
        taskId: (options.task as string) ?? options.item as string,
        agent: options.agent as string,
        model: options.model as string,
        fromDiff: options['from-diff'] === true || options.fromDiff === true,
        fromVersion:
          scorecardSub === 'prompt-diff'
            ? args.rest?.[0] ?? (options.from as string)
            : (options.from as string),
        toVersion:
          scorecardSub === 'prompt-diff'
            ? args.rest?.[1] ?? (options.to as string)
            : (options.to as string),
        profile: options.profile as string,
        costUsd: options.cost ? parseFloat(String(options.cost)) : undefined,
        tokens: options.tokens ? parseInt(String(options.tokens), 10) : undefined,
        durationMs: options.duration ? parseInt(String(options.duration), 10) : undefined,
        verdict: options.verdict as string,
        weightedScore: options.score ? parseFloat(String(options.score)) : undefined,
        source: options.source as string,
        since: options.since as string,
        modelsFilter,
        experimentId:
          (options.experiment as string) ??
          (scorecardSub === 'experiment' && args.rest?.[1] ? args.rest[1] : undefined) ??
          (scorecardSub === 'ablation' ? (args.rest?.[0] as string | undefined) : undefined),
        variantId: options.variant as string,
        suiteTaskId: (options['suite-task'] as string) ?? (options.suiteTask as string),
        suiteId: options.suite as string,
        suitePath: (options['suite-path'] as string) ?? (options.suitePath as string),
        components: options.components as string,
        experimentAction: scorecardSub === 'experiment' ? args.rest?.[0] : undefined,
      } as ScorecardOptions);
    }

    case 'seo': {
      const seoOptions = parseSeoOptions(options);
      if (!seoOptions.success) {
        return cliContractError('seo', seoOptions.errors);
      }
      if (subcommand === 'audit') {
        const { seoAuditCommand } = await import('../commands/seo-audit.command');
        return seoAuditCommand({
          url: options.url as string | undefined,
          sitemap: options.sitemap as string | undefined,
          format: seoOptions.format ?? (flags.output === 'json' ? 'json' : 'cli'),
          failOn: seoOptions.failOn ?? 'error',
          delay: seoOptions.delay ?? 500,
          output: options.output as string | undefined,
          followRedirects: options['follow-redirects'] === true,
          projectRoot,
          force: flags.force,
        } as SeoAuditOptions);
      }
      if (subcommand === 'llms') {
        const { seoLlmsCommand } = await import('../commands/seo-llms.command');
        return seoLlmsCommand({
          url: options.url as string | undefined,
          sitemap: options.sitemap as string | undefined,
          output: options.output as string | undefined,
          delay: seoOptions.delay ?? 500,
          projectRoot,
          force: flags.force,
        } as SeoLlmsOptions);
      }
      return {
        code: 1,
        data: {
          success: false,
          command: 'seo',
          errors: ['Usage: seo audit|llms. Run `codeconductor seo audit --help` for details.'],
        },
      };
    }

    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'unknown',
          errors: [`Unknown command: ${command}`],
        },
      };
  }
}
