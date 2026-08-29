import { getExitCode } from './errors';
import { getHelp, getVersion, parseArgs, routeCommand, type CliArgs } from './router';

/**
 * Command-line args after the runtime and script path (`init --force`, not
 * `bun src/cli/main.ts init --force`).
 */
export async function executeCli(args: string[], projectRoot: string): Promise<number> {
  const parsed = parseArgs(args);

  if (parsed.flags.version) {
    console.log(getVersion());
    return 0;
  }

  if (parsed.flags.help || !parsed.command || parsed.command === 'help') {
    console.log(getHelp());
    return 0;
  }

  try {
    const result = await routeCommand(parsed, projectRoot);
    emitCliResult(parsed, result);
    return result.code;
  } catch (error) {
    emitCliError(parsed, error);
    return getExitCode(error);
  }
}

function emitCliResult(parsed: CliArgs, result: { code: number; data?: unknown }): void {
  if (parsed.flags.output === 'json') {
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  if (!result.data) {
    return;
  }

  const data = result.data as Record<string, unknown>;

  if ('help' in data) {
    console.log(data.help as string);
    return;
  }

  if ('message' in data && typeof data.message === 'string') {
    console.log(data.message);
    return;
  }

  if (
    'errors' in data &&
    Array.isArray(data.errors) &&
    (data.errors as string[]).length > 0
  ) {
    (data.errors as string[]).forEach((e) => console.error(e));
  }

  if ('checks' in data) {
    const checks = data.checks as { name: string; status: string; message: string }[];
    checks.forEach((c) => {
      const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
      console.log(`${icon} ${c.name}: ${c.message}`);
    });
  } else if ('fileResults' in data) {
    const fileResults = data.fileResults as Array<{
      dest: string;
      action: string;
      dryRun?: boolean;
      error?: string;
    }>;
    const actionIcon: Record<string, string> = {
      written: '✓',
      appended: '→',
      merged: '~',
      skipped: '∅',
      error: '✗',
    };
    fileResults.forEach((r) => {
      if (r.action === 'skipped') return;
      const icon = actionIcon[r.action] ?? '?';
      const prefix = r.dryRun ? '[dry-run] ' : '';
      const suffix = r.error ? `: ${r.error}` : '';
      console.log(`${icon} ${prefix}${r.dest}${suffix}`);
    });
    const acted = fileResults.filter((r) => r.action !== 'skipped');
    const errCount = acted.filter((r) => r.action === 'error').length;
    const count = acted.length - errCount;
    const note = data.dryRun ? ' (dry-run)' : '';
    console.log(
      `\n${count} files processed${errCount > 0 ? `, ${errCount} errors` : ''}${note}`,
    );
  } else if ('written' in data) {
    const written = data.written as string[];
    if (written.length > 0) {
      if (
        'targets' in data &&
        Array.isArray(data.targets) &&
        (data.targets as string[]).length > 0
      ) {
        console.log(
          `Installed to: ${(data.targets as string[]).join(', ')} (${written.length} files)`,
        );
      } else {
        console.log(`Written ${written.length} files`);
      }
    }
  } else if ('wouldCreate' in data) {
    const items = data.wouldCreate as string[];
    console.log(`Would create ${items.length} files:`);
    items.forEach((f) => console.log(`  + ${f}`));
  } else if ('created' in data) {
    console.log(`Created ${(data.created as string[]).length} files`);
  } else if ('detected' in data) {
    console.log('Detected:');
    const detected = data.detected as Record<string, string[] | string>;
    Object.entries(detected).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 0) {
        console.log(`  - ${key}: ${value.join(', ')}`);
      } else if (typeof value === 'string' && value.length > 0) {
        console.log(`  - ${key}: ${value}`);
      }
    });
  } else if ('output' in data && typeof data.output === 'string') {
    console.log(data.output);
  }
}

function emitCliError(parsed: CliArgs, error: unknown): void {
  if (parsed.flags.output === 'json') {
    console.log(
      JSON.stringify(
        {
          success: false,
          errors: [String(error)],
        },
        null,
        2,
      ),
    );
    return;
  }
  console.error(String(error));
}
