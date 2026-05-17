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
        const data = result.data as Record<string, unknown>

        if ('help' in data) {
          console.log(data.help as string)
        } else {
          // Errors always go to stderr, independent of other output
          if ('errors' in data && Array.isArray(data.errors) && (data.errors as string[]).length > 0) {
            ;(data.errors as string[]).forEach(e => console.error(e))
          }

          // Checks (doctor output)
          if ('checks' in data) {
            const checks = data.checks as { name: string; status: string; message: string }[]
            checks.forEach(c => {
              const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗'
              console.log(`${icon} ${c.name}: ${c.message}`)
            })
          // fileResults (install preset output)
          } else if ('fileResults' in data) {
            const fileResults = data.fileResults as Array<{ dest: string; action: string; dryRun?: boolean; error?: string }>
            const actionIcon: Record<string, string> = { written: '✓', appended: '→', merged: '~', skipped: '∅', error: '✗' }
            fileResults.forEach(r => {
              if (r.action === 'skipped') return
              const icon = actionIcon[r.action] ?? '?'
              const prefix = r.dryRun ? '[dry-run] ' : ''
              const suffix = r.error ? `: ${r.error}` : ''
              console.log(`${icon} ${prefix}${r.dest}${suffix}`)
            })
            const acted = fileResults.filter(r => r.action !== 'skipped')
            const errCount = acted.filter(r => r.action === 'error').length
            const count = acted.length - errCount
            const note = data.dryRun ? ' (dry-run)' : ''
            console.log(`\n${count} files processed${errCount > 0 ? `, ${errCount} errors` : ''}${note}`)
          // written (install council output)
          } else if ('written' in data) {
            const written = data.written as string[]
            if (written.length > 0) {
              if ('targets' in data && Array.isArray(data.targets) && (data.targets as string[]).length > 0) {
                console.log(`Installed to: ${(data.targets as string[]).join(', ')} (${written.length} files)`)
              } else {
                console.log(`Written ${written.length} files`)
              }
            }
          // created (init output)
          } else if ('created' in data) {
            console.log(`Created ${(data.created as string[]).length} files`)
          // detected (detect output)
          } else if ('detected' in data) {
            console.log('Detected:')
            const detected = data.detected as Record<string, string[]>
            Object.entries(detected).forEach(([key, value]) => {
              if (value.length > 0) {
                console.log(`  - ${key}: ${value.join(', ')}`)
              }
            })
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