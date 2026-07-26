import { describe, expect, test } from 'bun:test';
import {
  loadAllWorkflowProfiles,
  loadWorkflowProfile,
  resolveWorkflowPhase,
} from '../../../../src/core/ccep/workflow-profile-loader';
import type { WorkflowProfileInput } from '../../../../src/validation/schemas';

const profile: WorkflowProfileInput = {
  id: 'feature',
  version: 1,
  command: 'feature',
  phases: [
    { id: 'intake', agent: 'task-coach', outputSchema: 'planner-output' },
    { id: 'design', agents: ['architect', 'reviewer'] },
    { id: 'bare' },
  ],
  routing: { default: ['architect'] },
  confirmationGate: { stopOnHighRisk: true, stopOnQuestions: true },
};

describe('core/ccep/workflow-profile-loader', () => {
  describe('resolveWorkflowPhase', () => {
    test('reads role and outputSchema from an explicit agent phase', () => {
      expect(resolveWorkflowPhase(profile, 'intake')).toEqual({
        id: 'intake',
        role: 'task-coach',
        outputSchema: 'planner-output',
      });
    });

    test('falls back to the first agent in an agents list', () => {
      expect(resolveWorkflowPhase(profile, 'design')).toEqual({
        id: 'design',
        role: 'architect',
        outputSchema: 'agent-output',
      });
    });

    test('defaults role to orchestrator and schema to agent-output', () => {
      expect(resolveWorkflowPhase(profile, 'bare')).toEqual({
        id: 'bare',
        role: 'orchestrator',
        outputSchema: 'agent-output',
      });
    });

    test('returns null for a missing phase', () => {
      expect(resolveWorkflowPhase(profile, 'nope')).toBeNull();
    });
  });

  describe('loadWorkflowProfile', () => {
    test('loads the profile for a known command', () => {
      expect(loadWorkflowProfile('feature').id).toBe('feature');
    });
  });

  describe('loadAllWorkflowProfiles', () => {
    test('returns a profile per bundled command', () => {
      const map = loadAllWorkflowProfiles();
      expect(map.size).toBeGreaterThan(0);
      expect(map.get('feature')?.id).toBe('feature');
    });
  });
});
