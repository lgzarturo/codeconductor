import { describe, expect, test } from 'bun:test';
import { ccepCommand } from '../../../src/commands/ccep.command';

const validFeatureCard = {
  id: 'tc-1',
  title: 'Add loyalty benefits',
  objective: 'Ship CRUD for loyalty benefits',
  context: 'Hotel loyalty module',
  acceptanceCriteria: ['GET /benefits returns 200 with a list'],
  risk: 'medium',
  targetFiles: ['src/benefits.ts'],
  agentType: 'implementer',
  status: 'ready',
  type: 'feature',
  requiresTests: true,
};

describe('ccep taskcard', () => {
  test('exit 0 for a valid feature card', async () => {
    const result = await ccepCommand({
      subcommand: 'taskcard',
      projectRoot: process.cwd(),
      output: 'json',
      command: 'feature',
      input: JSON.stringify(validFeatureCard),
    });
    expect(result.code).toBe(0);
    expect((result.data as { success: boolean }).success).toBe(true);
  });

  test('exit 1 when required fields are missing', async () => {
    const result = await ccepCommand({
      subcommand: 'taskcard',
      projectRoot: process.cwd(),
      output: 'json',
      command: 'feature',
      input: JSON.stringify({ ...validFeatureCard, title: '' }),
    });
    expect(result.code).toBe(1);
  });

  test('exit 1 when the workflow has no taskCard contract', async () => {
    const result = await ccepCommand({
      subcommand: 'taskcard',
      projectRoot: process.cwd(),
      output: 'json',
      command: 'review',
      input: JSON.stringify(validFeatureCard),
    });
    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors.join(' ')).toContain('does not declare');
  });
});
