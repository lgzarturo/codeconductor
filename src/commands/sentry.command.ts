import { readFileWithinRoot } from '../core/filesystem/path-containment';
import {
  extractScopeFiles,
  processSentryWebhook,
} from '../core/sentry/sentry-context-enricher';
import type { OutputMode } from '../utils/logger';

export interface SentryOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly input?: string;
  readonly signature?: string;
  readonly secret?: string;
  readonly skipVerify?: boolean;
}

const USAGE =
  'Usage: sentry issue --input @body.json [--signature <sha256=...> --secret <s>|--skip-verify]';

export async function sentryCommand(
  options: SentryOptions,
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, projectRoot, output } = options;
  const fail = (errors: string[]) => ({
    code: 1,
    data: { success: false, command: 'sentry issue', errors },
  });

  if (subcommand !== 'issue') {
    return fail([`Unknown subcommand: ${subcommand || '(none)'}. ${USAGE}`]);
  }
  if (!options.input) {
    return fail([USAGE]);
  }

  let rawBody: string;
  if (options.input.startsWith('@')) {
    const content = await readFileWithinRoot(projectRoot, options.input.slice(1));
    if (content === undefined) {
      return fail([`Cannot read input file: ${options.input.slice(1)}`]);
    }
    rawBody = content;
  } else {
    rawBody = options.input;
  }

  const secret = options.secret ?? process.env.SENTRY_WEBHOOK_SECRET;
  const processed = processSentryWebhook(rawBody, options.signature, {
    secret,
    skipSignatureVerification: options.skipVerify === true,
  });
  if (!processed.success) {
    return fail([processed.error.message]);
  }

  const card = processed.data;
  const scopeFiles = extractScopeFiles(rawBody);
  if (output === 'json') {
    return { code: 0, data: { success: true, command: 'sentry issue', card, scopeFiles } };
  }
  const lines = [
    `Title: ${card.Title ?? '(untitled)'}`,
    `Type: ${card.Type ?? '?'} | Risk: ${card.Risk ?? '?'}`,
    `Scope: ${card.Scope ?? '(none)'}`,
    `Scope files (${scopeFiles.length}): ${scopeFiles.join(', ') || 'none'}`,
  ];
  return { code: 0, data: { success: true, command: 'sentry issue', output: lines.join('\n') } };
}
