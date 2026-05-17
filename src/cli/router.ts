import type { OutputMode } from '../utils/logger'
import { initCommand, type InitOptions } from '../commands/init.command'
import { detectCommand, type DetectOptions } from '../commands/detect.command'
import { installCommand, type InstallOptions } from '../commands/install.command'
import { doctorCommand, type DoctorOptions } from '../commands/doctor.command'
import { updateCommand, type UpdateOptions } from '../commands/update.command'

/**
 * Parsed CLI arguments
 */
export interface CliArgs {
  command: string
  options: Record<string, unknown>
  flags: {
    help: boolean
    dryRun: boolean
    force: boolean
    output: OutputMode
  }
}

/**
 * Parse command from args
 */
export function parseArgs(args: string[]): CliArgs {
  const flags = {
    help: false,
    dryRun: false,
    force: false,
    output: 'human' as OutputMode
  }

  const options: Record<string, unknown> = {}

  // First pass: collect flags
  const remaining: string[] = []
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      flags.help = true
    } else if (arg === '--dry-run') {
      flags.dryRun = true
    } else if (arg === '--force') {
      flags.force = true
    } else if (arg === '--output' || arg === '-o') {
      // Will be handled in next iteration
      remaining.push(arg)
    } else if (arg.startsWith('--output=') || arg.startsWith('-o=')) {
      const value = arg.split('=')[1]
      if (value === 'json' || value === 'human') {
        flags.output = value
      }
    } else {
      remaining.push(arg)
    }
  }

  // Handle --output -o value
  for (let i = 0; i < remaining.length; i++) {
    if ((remaining[i] === '--output' || remaining[i] === '-o') && remaining[i + 1]) {
      const value = remaining[i + 1]
      if (value === 'json' || value === 'human') {
        flags.output = value
        remaining.splice(i, 2)
        i--
      }
    }
  }

  // Remaining first arg is command
  const command = remaining[0] || 'help'

  // Parse remaining args for options
  for (let i = 1; i < remaining.length; i++) {
    const arg = remaining[i]
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      if (value !== undefined) {
        options[key] = value
      } else if (remaining[i + 1] && !remaining[i + 1].startsWith('-')) {
        options[key] = remaining[++i]
      } else {
        options[key] = true
      }
    }
  }

  return { command, options, flags }
}

/**
 * Get help text
 */
export function getHelp(): string {
  return `CodeConductor CLI v0.1.0

Usage: codeconductor <command> [options]

Commands:
  init                    Initialize CodeConductor in a project
  detect                 Detect project stack and recommended presets
  install council        Install council preset to runner targets
  doctor                 Validate configuration and generated files
  update                 Update installed presets

Options:
  --help, -h             Show this help message
  --dry-run              Show what would happen without writing files
  --force                Allow overwriting existing files
  --global               Install to home directory (~/.claude, ~/.opencode, etc.)
  --output, -o           Output mode: human or json

Examples:
  codeconductor init
  codeconductor init --global
  codeconductor detect
  codeconductor install council --target opencode
  codeconductor install council --target all
  codeconductor install council --target claude --global
  codeconductor doctor
  codeconductor update --dry-run
`
}

/**
 * Route command to handler
 */
export async function routeCommand(args: CliArgs, projectRoot: string): Promise<{ code: number; data?: unknown }> {
  const { command, options, flags } = args

  switch (command) {
    case 'help':
      return { code: 0, data: { help: getHelp() } }

    case 'init':
      return initCommand({
        projectRoot,
        dryRun: flags.dryRun,
        force: flags.force,
        global: options.global === true || options.global === 'true',
        output: flags.output
      } as InitOptions)

    case 'detect':
      return detectCommand({
        projectRoot,
        output: flags.output
      } as DetectOptions)

    case 'install': {
      const target = options.target as string || 'opencode'
      return installCommand({
        projectRoot,
        target,
        dryRun: flags.dryRun,
        force: flags.force,
        global: options.global === true || options.global === 'true',
        output: flags.output
      } as InstallOptions)
    }

    case 'doctor':
      return doctorCommand({
        projectRoot,
        output: flags.output
      } as DoctorOptions)

    case 'update':
      return updateCommand({
        projectRoot,
        dryRun: flags.dryRun,
        force: flags.force,
        output: flags.output
      } as UpdateOptions)

    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'unknown',
          errors: [`Unknown command: ${command}`]
        }
      }
  }
}