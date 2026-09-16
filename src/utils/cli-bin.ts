import { basename } from 'node:path';

/**
 * Resolve the CLI command prefix based on execution context.
 *
 * - When invoked via npx (e.g. `npx cc-codeconductor ...`), returns `npx cc-codeconductor`.
 * - When invoked via bunx, returns `bunx cc-codeconductor`.
 * - When invoked during local development (`bun run dev` or executing `src/cli/main.ts`), returns `bun run dev`.
 * - When invoked via an installed binary (`cc-codeconductor` or `codeconductor`), returns that binary name.
 * - Respects the `CC_CLI_BIN` environment variable for testing or explicit overrides.
 * - Defaults to `cc-codeconductor`.
 */
export function resolveCliBin(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): string {
  if (env.CC_CLI_BIN) {
    return env.CC_CLI_BIN;
  }

  // Detected npx runner
  if (
    env.npm_lifecycle_event === 'npx' ||
    env.npm_command === 'exec' ||
    env._?.endsWith('/npx') ||
    env._ === 'npx'
  ) {
    return 'npx cc-codeconductor';
  }

  // Detected bunx runner
  if (env._?.endsWith('/bunx') || env._ === 'bunx') {
    return 'bunx cc-codeconductor';
  }

  // Detected dev script execution
  if (env.npm_lifecycle_event === 'dev') {
    return env.npm_lifecycle_script?.startsWith('bun') ? 'bun run dev' : 'npm run dev';
  }

  if (argv && argv.length > 1 && argv[1]) {
    const script = argv[1];
    const binName = basename(script);

    if (binName === 'main.ts') {
      return 'bun run dev';
    }

    if (binName === 'cc-codeconductor' || binName === 'codeconductor') {
      return binName;
    }
  }

  return 'cc-codeconductor';
}

/**
 * Formats a command usage string replacing any legacy or alternative command prefix
 * (`cc `, `cc-codeconductor `, or `codeconductor `) with the resolved bin prefix.
 */
export function formatUsage(usage: string, bin: string = resolveCliBin()): string {
  return usage.replace(/^(?:cc-codeconductor|codeconductor|cc)\b/, bin);
}
