import { recommendCorrection } from '../core/ask/recommend-correction';
import type { OutputMode } from '../utils/logger';

export interface CorrectOptions {
  readonly signal: string;
  readonly output: OutputMode;
}

export async function correctCommand(
  options: CorrectOptions,
): Promise<{ code: number; data?: unknown }> {
  const signal = options.signal.trim();
  if (!signal) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'correct',
        errors: [
          'Usage: correct "<mistake signal>". Recommends a layer and existing command; does not start a workflow.',
        ],
      },
    };
  }

  const rec = recommendCorrection(signal);
  const proseLine = rec.forbidProse
    ? 'Do not add AGENTS.md prose — a lower-layer owner already exists.'
    : 'Prose is allowed only if no architecture, lint, or verification owner can enforce the rule.';

  return {
    code: 0,
    data: {
      success: true,
      command: 'correct',
      recommended: rec,
      executed: false,
      message:
        `Layer: ${rec.layer}\nCommand: ${rec.command}\n${rec.reason}\n\n` +
        `${proseLine}\n` +
        'Do not start a workflow from this recommendation.',
    },
  };
}
