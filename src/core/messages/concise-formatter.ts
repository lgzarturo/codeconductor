/**
 * Concise Formatter — inter-agent message formatting.
 *
 * Produces deliverable-only output with no self-summary. Consistent formatting
 * across all agents to reduce token usage in multi-agent workflows.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentDeliverable {
  /** The agent that produced this deliverable. */
  readonly agent: string;
  /** Deliverable type identifier. */
  readonly type: string;
  /** The actual content/output. */
  readonly content: string;
  /** Optional metadata (files changed, errors found, etc). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Format an agent deliverable into a concise inter-agent message.
 *
 * Output is deliverable-only — no self-summary, no agent commentary.
 * Format:
 * ```
 * [agent:type]
 * content
 * ---
 * key: value
 * ```
 *
 * @param agent - Agent name (e.g., "implementer", "tester").
 * @param deliverable - The deliverable object.
 * @returns Formatted string.
 */
export function formatAgentMessage(
  agent: string,
  deliverable: AgentDeliverable,
): string {
  const lines: string[] = [];

  // Header line — compact, no fluff
  lines.push(`[${deliverable.agent || agent}:${deliverable.type}]`);

  // Content block — the actual work output
  if (deliverable.content) {
    lines.push(deliverable.content);
  }

  // Metadata footer — only if present
  if (deliverable.metadata && Object.keys(deliverable.metadata).length > 0) {
    lines.push('---');
    for (const [key, value] of Object.entries(deliverable.metadata)) {
      lines.push(`${key}: ${formatValue(value)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a concise error feedback string for agent re-injection.
 *
 * Strips raw error lines and produces a compact summary suitable for
 * token-constrained contexts.
 *
 * @param errors - Array of error objects with file, code, message.
 * @returns Concise error summary.
 */
export function formatConciseFeedback(
  errors: readonly Array<{ file?: string; code?: string; message: string }>,
): string {
  if (errors.length === 0) return '';

  const lines: string[] = [
    `${errors.length} error(s):`,
    '',
  ];

  for (let i = 0; i < errors.length; i++) {
    const err = errors[i]!;
    const location = [err.file, err.code].filter(Boolean).join(' ');
    lines.push(`${i + 1}. ${location}: ${err.message}`);
  }

  return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}
