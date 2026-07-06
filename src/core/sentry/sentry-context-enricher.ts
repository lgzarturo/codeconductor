import { createHmac, timingSafeEqual } from 'node:crypto';
import { ok, err, type Result } from '../../utils/result';
import { SentryWebhookSchema } from '../../validation/schemas';
import type { SentryWebhookInput } from '../../validation/schemas';

// ─── Interfaces ─────────────────────────────────────────────────────────────

/**
 * A single stack frame from a Sentry issue
 */
export interface StackFrame {
  filename: string;
  function: string;
  lineNo: number;
  colNo?: number;
  context: string[];
}

/**
 * Sentry issue context extracted from a webhook payload
 */
export interface SentryIssueContext {
  issueId: string;
  title: string;
  culprit: string;
  filename?: string;
  stackTrace: StackFrame[];
  environment?: string;
  release?: string;
}

/**
 * Task Card matching the AGENTS.md structure.
 * Returned as Partial<TaskCard> from webhook processing.
 */
export interface TaskCard {
  Title: string;
  Type: 'feature' | 'fix' | 'refactor' | 'review' | 'docs' | 'test';
  Risk: 'low' | 'medium' | 'high';
  Scope: string;
  Context: string;
  'Acceptance Criteria': string[];
  Constraints: string[];
  Routing: { Agent: string; 'Requires review': boolean };
}

/**
 * Error type for Sentry webhook processing
 */
export interface SentryError {
  kind: 'validation' | 'signature' | 'mapping';
  message: string;
  details?: unknown;
}

/**
 * Options for webhook processing
 */
export interface SentryWebhookOptions {
  secret?: string;
  skipSignatureVerification?: boolean;
}

// ─── Types ───────────────────────────────────────────────────────────────

export type SentryWebhookPayload = SentryWebhookInput;

// ─── Risk Heuristics ────────────────────────────────────────────────────

const HIGH_RISK_KEYWORDS = ['auth', 'security', 'payment', 'credential', 'token', 'session'];
const MEDIUM_RISK_KEYWORDS = ['api', 'database', 'db', 'query', 'config', 'migration'];

function inferRisk(issue: SentryIssueContext): 'low' | 'medium' | 'high' {
  const text = `${issue.title} ${issue.culprit} ${issue.filename ?? ''}`.toLowerCase();

  if (HIGH_RISK_KEYWORDS.some((k) => text.includes(k))) {
    return 'high';
  }
  if (MEDIUM_RISK_KEYWORDS.some((k) => text.includes(k))) {
    return 'medium';
  }
  return 'low';
}

function formatStackTrace(frames: StackFrame[]): string {
  if (frames.length === 0) return 'No stack trace available';
  return frames
    .map((f) => `  at ${f.function} (${f.filename}:${f.lineNo}${f.colNo != null ? `:${f.colNo}` : ''})`)
    .join('\n');
}

// ─── Pure Mapper ────────────────────────────────────────────────────────────

/**
 * Maps a SentryIssueContext to a Partial<TaskCard>.
 * Pure function — no side effects.
 */
export function enrichFromSentryIssue(issue: SentryIssueContext): Partial<TaskCard> {
  const scope = issue.filename ?? issue.culprit;
  const stackBlock = formatStackTrace(issue.stackTrace);

  const contextParts = [`Sentry Issue: ${issue.issueId}`];
  if (issue.environment) contextParts.push(`Environment: ${issue.environment}`);
  if (issue.release) contextParts.push(`Release: ${issue.release}`);
  contextParts.push(`Culprit: ${issue.culprit}`);
  contextParts.push('', 'Stack Trace:', stackBlock);

  return {
    Title: issue.title,
    Scope: scope,
    Context: contextParts.join('\n'),
    Type: 'fix',
    Risk: inferRisk(issue),
  };
}

// ─── Signature Verification ─────────────────────────────────────────────────

/**
 * Verifies HMAC-SHA256 signature of a Sentry webhook payload.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifySentrySignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  // support both "sha256=<hex>" and bare hex
  const received = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  // Validate hex format before conversion — non-hex input must not crash
  if (!/^[0-9a-f]*$/i.test(received)) return false;
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

// ─── Webhook Processing ─────────────────────────────────────────────────────

/**
 * Validates a Sentry webhook payload, verifies its signature against
 * the raw body, and maps it to a Partial<TaskCard>.
 *
 * @param rawBody - The raw HTTP body string (not parsed JSON)
 * @param signatureHeader - The Sentry signature header (e.g. "sha256=<hex>")
 * @param options - Secret key and verification flags
 */
export function processSentryWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  options: SentryWebhookOptions = {},
): Result<Partial<TaskCard>, SentryError> {
  const { secret, skipSignatureVerification = false } = options;

  // Signature verification is on by default — require secret when not skipping
  if (!skipSignatureVerification && !secret) {
    return err({
      kind: 'signature',
      message: 'Signature verification enabled but no secret provided',
    });
  }

  // Verify signature BEFORE Zod validation to reject tampered payloads early
  if (!skipSignatureVerification && secret) {
    if (!signatureHeader) {
      return err({
        kind: 'signature',
        message: 'Signature header missing',
      });
    }
    if (!verifySentrySignature(rawBody, signatureHeader, secret)) {
      return err({
        kind: 'signature',
        message: 'Signature verification failed',
      });
    }
  }

  // Parse raw body as JSON, then validate shape
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return err({
      kind: 'validation',
      message: 'Invalid JSON in webhook body',
    });
  }

  const parsed = SentryWebhookSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return err({
      kind: 'validation',
      message: 'Invalid Sentry webhook payload',
      details: parsed.error.flatten(),
    });
  }

  return ok(enrichFromSentryIssue(parsed.data));
}
