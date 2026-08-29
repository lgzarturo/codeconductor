import { describe, expect, test } from 'bun:test';
import { WORKFLOW_PROFILES } from '../../../../src/core/ccep/profiles';
import { loadWorkflowProfileFromYaml } from '../../../../src/core/ccep/profile-yaml';
import type { WorkflowCommandInput } from '../../../../src/validation/schemas';

describe('taskCard YAML ↔ WORKFLOW_PROFILES parity', () => {
  const commands = (Object.keys(WORKFLOW_PROFILES) as WorkflowCommandInput[]).filter(
    (command) => WORKFLOW_PROFILES[command].taskCard !== undefined,
  );

  test('eleven profiles declare taskCard', () => {
    expect(commands).toHaveLength(11);
  });

  for (const command of commands) {
    test(`${command} taskCard matches bundled YAML`, () => {
      const yaml = loadWorkflowProfileFromYaml(command);
      expect(yaml).not.toBeNull();
      expect(yaml!.taskCard).toEqual(WORKFLOW_PROFILES[command].taskCard);
    });
  }
});
