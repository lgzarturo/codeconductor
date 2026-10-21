import { buildDebugHandoff, writeDebugHandoff } from '../core/goal/debug-handoff';
import type { OutputMode } from '../utils/logger';

export interface DebugOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly taskId?: string;
}

const USAGE = 'Usage: debug handoff --task <id>';

export async function debugCommand(
  options: DebugOptions,
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, projectRoot, output, taskId } = options;
  const fail = (errors: string[]) => ({
    code: 1,
    data: { success: false, command: 'debug handoff', errors },
  });

  if (subcommand !== 'handoff') {
    return fail([`Unknown subcommand: ${subcommand || '(none)'}. ${USAGE}`]);
  }
  if (!taskId) {
    return fail([USAGE]);
  }

  const handoff = await buildDebugHandoff(projectRoot, taskId);
  if (!handoff.success) {
    return fail([handoff.error.message]);
  }
  const written = await writeDebugHandoff(projectRoot, taskId);
  if (!written.success) {
    return fail([written.error.message]);
  }

  if (output === 'json') {
    return {
      code: 0,
      data: { success: true, command: 'debug handoff', taskId, path: written.data.path },
    };
  }
  return {
    code: 0,
    data: { success: true, command: 'debug handoff', output: handoff.data.markdown },
  };
}
