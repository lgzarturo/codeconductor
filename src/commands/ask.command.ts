import { recommendAskFlow } from '../core/ask/recommend-flow';
import type { OutputMode } from '../utils/logger';

export interface AskOptions {
  readonly problem: string;
  readonly output: OutputMode;
}

export async function askCommand(
  options: AskOptions,
): Promise<{ code: number; data?: unknown }> {
  const problem = options.problem.trim();
  if (!problem) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'ask',
        errors: ['Usage: ask "<problem in natural language>". Does not start a workflow.'],
      },
    };
  }

  const rec = recommendAskFlow(problem);
  return {
    code: 0,
    data: {
      success: true,
      command: 'ask',
      recommended: rec,
      executed: false,
      message:
        `Recommended: ${rec.slash}\n${rec.reason}\n\n` +
        'Do not start that workflow until the human confirms.',
    },
  };
}
