import packageJson from '../../package.json';
import { detectCommand, type DetectOptions } from '../commands/detect.command';
import { doctorCommand, type DoctorOptions } from '../commands/doctor.command';
import { initCommand, type InitOptions } from '../commands/init.command';
import {
  installCommand,
  installPresetCommand,
  type InstallOptions,
  type InstallPresetOptions,
} from '../commands/install.command';
import { installLspCommand, type InstallLspOptions } from '../commands/install-lsp.command';
import { debtHarvestCommand, type DebtHarvestOptions } from '../commands/debt-harvest.command';
import { goalCommand, type GoalOptions } from '../commands/goal.command';
import { ccepCommand, type CcepOptions } from '../commands/ccep.command';
import { openspecCommand, type OpenspecOptions } from '../commands/openspec.command';
import { scorecardCommand, type ScorecardOptions } from '../commands/scorecard.command';
import { helpCommand, type HelpOptions } from '../commands/help.command';
import { seoAuditCommand } from '../commands/seo-audit.command';
import { seoLlmsCommand } from '../commands/seo-llms.command';
import type { SeoAuditOptions, SeoLlmsOptions } from '../domain/seo/seo-types';
import { updateCommand, type UpdateOptions } from '../commands/update.command';
import { ingestCommand, type IngestOptions } from '../commands/ingest.command';
import { productCommand, type ProductOptions } from '../commands/product.command';
import { orchestrateCommand, type OrchestrateOptions } from '../commands/orchestrate.command';
import { impactCommand, type ImpactOptions } from '../commands/impact.command';
import { verifyCommand, type VerifyOptions } from '../commands/verify.command';
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
}

/**
 * Parse command from args
 */
export function parseArgs(args: string[]): CliArgs {
  const flags = {
    help: false,
    version: false,
    dryRun: false,
    force: false,
    output: 'human' as OutputMode,
  };

  const options: Record<string, unknown> = {};

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
      if (value === 'json' || value === 'human') {
        flags.output = value;
      }
    } else {
      remaining.push(arg);
    }
  }

  // Handle --output -o value
  for (let i = 0; i < remaining.length; i++) {
    if ((remaining[i] === '--output' || remaining[i] === '-o') && remaining[i + 1]) {
      const value = remaining[i + 1];
      if (value === 'json' || value === 'human') {
        flags.output = value;
        remaining.splice(i, 2);
        i--;
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

  return { command, subcommand, options, flags, rest };
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

Commands:
  init                    Initialize CodeConductor in a project
  detect                  Detect project stack and recommended presets
  install council         Install generated council spec files to runner targets
  install preset          Install full preset (agents, prompts, skills, commands)
  install lsp             Install and configure LSP servers for AI coding tools
  seo audit               Run SEO audit on a URL or sitemap
  seo llms                Generate llms.txt from a URL or sitemap
  doctor                  Validate configuration and generated files
  update                  Update installed presets
  help / cc-help          Show preset inventory (skills, subagents, commands)
  debt-harvest / harvest  Scan source files for deferred debt items
  goal / cc-goal          Plan goal into task graph with dependencies
  ingest                  Ingest repo knowledge into product graph
  product                 Explore product graph and memory
  orchestrate             Runtime orchestrator for goal execution
  impact                  Analyze change impact on product graph
  verify                  Verify task completion with evidence

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
  Stack detection wires matching specialized skills automatically when
  init/detect identifies the stack.

Workflow Loop Core (v0.4.0):
  runWorkflowPipeline() in src/core/pipeline/workflow-loop.ts runs the
  8-phase loop (intake -> structure -> design -> test -> implement ->
  validate -> council -> compact) with wall-clock, files-modified and
  lines-changed guardrails and STOP gates after Design and Council.

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
  npx cc-codeconductor openspec validate
  npx cc-codeconductor openspec scan
  npx cc-codeconductor openspec plan BC-001
  npx cc-codeconductor openspec status
  npx cc-codeconductor openspec next
  npx cc-codeconductor scorecard create --task BC-001 --from-diff
  npx cc-codeconductor scorecard models
  npx cc-codeconductor scorecard aggregate
  npx cc-codeconductor help --target opencode
  npx cc-codeconductor help --target claude --output json

Docs: https://github.com/lgzarturo/codeconductor/tree/main/docs
  docs/v0.4.0-release-notes.md   v0.4.0 feature breakdown
  docs/routing-policy.md         Risk-based routing (v0.4.0)
  docs/prompt-versioning.md      Agent contract versions
  docs/usage-cli.md              Detailed CLI reference
`;
}

/**
 * Route command to handler
 */
export async function routeCommand(
  args: CliArgs,
  projectRoot: string
): Promise<{ code: number; data?: unknown }> {
  const { command, subcommand, options, flags } = args;

  switch (command) {
    case 'init':
      return initCommand({
        projectRoot,
        dryRun: flags.dryRun,
        force: flags.force,
        global: options.global === true || options.global === 'true',
        output: flags.output,
        locale: (options.locale === 'es' ? 'es' : 'en') as 'en' | 'es',
      } as InitOptions);

    case 'detect':
      return detectCommand({
        projectRoot,
        output: flags.output,
      } as DetectOptions);

    case 'install': {
      const isGlobal = options.global === true || options.global === 'true';
      const VALID_TARGETS = ['opencode', 'claude', 'codex', 'gemini', 'cursor', 'agy', 'all'];

      // If subcommand is a runner name (not a preset name), treat it as --target
      let resolvedSubcommand = subcommand;
      let target = options.target as string;
      if (!target && subcommand && VALID_TARGETS.includes(subcommand)) {
        target = subcommand;
        resolvedSubcommand = undefined;
      }
      target = target || 'opencode';

      if (resolvedSubcommand === 'lsp') {
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

    case 'doctor':
      return doctorCommand({
        projectRoot,
        output: flags.output,
      } as DoctorOptions);

    case 'update':
      return updateCommand({
        projectRoot,
        dryRun: flags.dryRun,
        force: flags.force,
        global: options.global === true || options.global === 'true',
        output: flags.output,
      } as UpdateOptions);

    case 'help':
    case 'cc-help':
      return helpCommand({
        projectRoot,
        target: options.target as string | undefined,
        output: flags.output,
      } as HelpOptions);

    case 'debt-harvest':
    case 'harvest':
      return debtHarvestCommand({
        projectRoot,
        dir: options.dir as string | undefined,
        output: flags.output,
      } as DebtHarvestOptions);

    case 'goal':
    case 'cc-goal':
      return goalCommand({
        objective: subcommand || (options.objective as string) || args.rest?.join(' ') || '',
        projectRoot,
        output: flags.output,
        product: options.product === true || options.product === 'true',
        dryRun: flags.dryRun,
      } as GoalOptions);

    case 'ingest':
      return ingestCommand({
        projectRoot,
        output: flags.output,
      } as IngestOptions);

    case 'product':
    case 'cc-product': {
      const validSubs = ['graph', 'query', 'path', 'timeline', 'memory', 'decisions', 'insights', 'export'];
      const productSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'graph';
      const queryText = productSub === 'query' ? args.rest?.join(' ') : undefined;
      const pathFrom = productSub === 'path' ? args.rest?.[0] : undefined;
      const pathTo = productSub === 'path' ? args.rest?.[1] : undefined;
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
      const orchSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'status';
      return orchestrateCommand({
        subcommand: orchSub,
        projectRoot,
        output: flags.output,
        taskId: (options.task as string) ?? args.rest?.[0],
        complete: options.complete === true || options.complete === 'true',
      } as OrchestrateOptions);
    }

    case 'impact':
    case 'cc-impact': {
      const filesOpt = options.files as string | undefined;
      const files = filesOpt ? filesOpt.split(',').map((s) => s.trim()) : args.rest;
      return impactCommand({
        projectRoot,
        output: flags.output,
        files: files?.length ? files : undefined,
        node: options.node as string | undefined,
        capability: options.capability as string | undefined,
      } as ImpactOptions);
    }

    case 'verify':
    case 'cc-verify':
      return verifyCommand({
        projectRoot,
        output: flags.output,
        taskId: (options.task as string) ?? args.rest?.[0] ?? '',
      } as VerifyOptions);

    case 'ccep': {
      const validSubs = ['parse', 'profile', 'resolve', 'compile', 'validate'];
      const ccepSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'parse';
      const workflowCommand = (options.command as string) || undefined;
      const requestParts = args.rest ?? [];
      const userRequest =
        ccepSub === 'profile' && !workflowCommand
          ? requestParts[0]
          : ['compile', 'resolve', 'parse'].includes(ccepSub)
            ? requestParts.join(' ').trim()
            : requestParts.join(' ').trim();

      const validateRest =
        ccepSub === 'validate' && !options.input ? requestParts : undefined;

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
        rest: validateRest,
      } as CcepOptions);
    }

    case 'openspec':
    case 'cc-openspec': {
      const validSubs = ['validate', 'scan', 'plan', 'status', 'next'];
      let openspecSub = 'validate';
      let itemId: string | undefined = (options.item as string) || undefined;

      if (subcommand && validSubs.includes(subcommand)) {
        openspecSub = subcommand;
        itemId = itemId ?? args.rest?.[0];
      } else if (subcommand && /^BC-\d+$/i.test(subcommand)) {
        openspecSub = 'plan';
        itemId = subcommand;
      } else if (subcommand) {
        openspecSub = subcommand;
      }

      return openspecCommand({
        subcommand: openspecSub,
        itemId,
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
      ];
      let scorecardSub = subcommand && validSubs.includes(subcommand) ? subcommand : 'aggregate';
      if (!subcommand || !validSubs.includes(subcommand)) {
        scorecardSub = 'aggregate';
      }

      const modelsFilter =
        typeof options.models === 'string'
          ? options.models.split(',').map((s) => s.trim())
          : undefined;

      return scorecardCommand({
        subcommand: scorecardSub,
        projectRoot,
        output: flags.output,
        id: scorecardSub === 'show' ? args.rest?.[0] ?? (options.id as string) : (options.id as string),
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
      } as ScorecardOptions);
    }

    case 'seo': {
      if (subcommand === 'audit') {
        return seoAuditCommand({
          url: options.url as string | undefined,
          sitemap: options.sitemap as string | undefined,
          format: (options.format as SeoAuditOptions['format']) ?? (flags.output === 'json' ? 'json' : 'cli'),
          failOn: (options['fail-on'] as SeoAuditOptions['failOn']) ?? 'error',
          delay: options.delay ? parseInt(String(options.delay), 10) : 500,
          output: options.output as string | undefined,
          followRedirects: options['follow-redirects'] === true,
          projectRoot,
        } as SeoAuditOptions);
      }
      if (subcommand === 'llms') {
        return seoLlmsCommand({
          url: options.url as string | undefined,
          sitemap: options.sitemap as string | undefined,
          output: options.output as string | undefined,
          delay: options.delay ? parseInt(String(options.delay), 10) : 500,
          projectRoot,
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
