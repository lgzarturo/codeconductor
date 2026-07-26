import { loadGoal } from '../core/goal/goal-state';
import { runVerification } from '../core/verification/verification-runner';
import type { OutputMode } from '../utils/logger';

export interface VerifyOptions {
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly taskId: string;
}

export async function verifyCommand(
  options: VerifyOptions,
): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output, taskId } = options;

  if (!taskId) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'verify',
        errors: ['Task ID required. Usage: verify --task <id>'],
      },
    };
  }

  const goal = await loadGoal(projectRoot);
  const goalData = goal.success ? goal.data : undefined;

  const result = await runVerification(projectRoot, taskId, goalData);
  if (!result.success) {
    return {
      code: 1,
      data: { success: false, command: 'verify', errors: [result.error.message] },
    };
  }

  if (output === 'json') {
    return {
      code: result.data.passed ? 0 : 1,
      data: {
        success: result.data.passed,
        command: 'verify',
        taskId,
        ...result.data,
      },
    };
  }

  const lines = [
    `Verification for task: ${taskId}`,
    `Passed: ${result.data.passed}`,
    '',
    ...result.data.checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.name}: ${c.message}`),
    '',
    `Evidence: ${result.data.evidenceIds.join(', ')}`,
  ];

  return {
    code: result.data.passed ? 0 : 1,
    data: { success: result.data.passed, command: 'verify', output: lines.join('\n') },
  };
}
