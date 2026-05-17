import { parseArgs, routeCommand, getHelp } from './router'
import { getExitCode } from './errors'

/**
 * Run the CLI
 */
export async function runCli(args: string[]): Promise<void> {
  const parsed = parseArgs(args.slice(2)) // Skip node and script path

  // Show help if requested or no command
  if (parsed.flags.help || !parsed.command || parsed.command === 'help') {
    console.log(getHelp())
    process.exit(0)
  }

  // Get project root (current directory)
  const projectRoot = process.cwd()

  try {
    const result = await routeCommand(parsed, projectRoot)

    // Output result
    if (parsed.flags.output === 'json') {
      console.log(JSON.stringify(result.data, null, 2))
    } else {
      if (result.data) {
        if ('errors' in (result.data as object) && (result.data as { errors?: string[] }).errors) {
          const errors = (result.data as { errors: string[] }).errors
          errors.forEach(e => console.error(e))
        } else if ('help' in (result.data as object)) {
          console.log((result.data as { help: string }).help)
        } else if ('message' in (result.data as object)) {
          console.log((result.data as { message: string }).message)
        } else if ('success' in (result.data as object)) {
          const data = result.data as { success: boolean; command: string; [key: string]: unknown }
          if (data.success) {
            if ('written' in data) {
              console.log(`Written ${(data.written as string[]).length} files`)
            } else if ('created' in data) {
              console.log(`Created ${(data.created as string[]).length} files`)
            } else if ('detected' in data) {
              console.log('Detected:')
              const detected = data.detected as Record<string, string[]>
              Object.entries(detected).forEach(([key, value]) => {
                if (value.length > 0) {
                  console.log(`  - ${key}: ${value.join(', ')}`)
                }
              })
            } else if ('checks' in data) {
              const checks = data.checks as { name: string; status: string; message: string }[]
              checks.forEach(c => {
                const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗'
                console.log(`${icon} ${c.name}: ${c.message}`)
              })
            }
          }
        }
      }
    }

    process.exit(result.code)
  } catch (error) {
    const exitCode = getExitCode(error)

    if (parsed.flags.output === 'json') {
      console.log(JSON.stringify({
        success: false,
        errors: [String(error)]
      }, null, 2))
    } else {
      console.error(String(error))
    }

    process.exit(exitCode)
  }
}

// Run if called directly
runCli(process.argv)