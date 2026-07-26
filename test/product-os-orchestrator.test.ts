import { describe, expect, test } from 'bun:test';
import { getReadyTasks } from '../src/core/orchestrator/runtime-orchestrator';
import type { GoalGraphInput } from '../src/validation/schemas';

describe('Orchestrator runtime', () => {
  test('getReadyTasks respects dependencies', () => {
    const graph: GoalGraphInput = {
      objective: 'test',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 'a',
          title: 'First',
          type: 'feature',
          risk: 'low',
          status: 'done',
          depends_on: [],
          acceptance_criteria: ['done'],
        },
        {
          id: 'b',
          title: 'Second',
          type: 'feature',
          risk: 'low',
          status: 'pending',
          depends_on: ['a'],
          acceptance_criteria: ['done'],
        },
        {
          id: 'c',
          title: 'Third',
          type: 'feature',
          risk: 'low',
          status: 'pending',
          depends_on: ['b'],
          acceptance_criteria: ['done'],
        },
      ],
    };

    const ready = getReadyTasks(graph);
    expect(ready.length).toBe(1);
    expect(ready[0]!.id).toBe('b');
  });

  test('blocked tasks are not ready', () => {
    const graph: GoalGraphInput = {
      objective: 'test',
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: 'a',
          title: 'Blocked',
          type: 'feature',
          risk: 'low',
          status: 'blocked',
          depends_on: [],
          acceptance_criteria: ['x'],
        },
      ],
    };
    expect(getReadyTasks(graph).length).toBe(0);
  });
});
