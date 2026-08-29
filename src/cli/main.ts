#!/usr/bin/env node

import { executeCli } from './execute';

/**
 * Run the CLI. Exits the process with the command status.
 */
export async function runCli(args: string[]): Promise<void> {
  const code = await executeCli(args.slice(2), process.cwd());
  process.exit(code);
}

runCli(process.argv);
