import { describe, expect, test } from 'bun:test';
import { helpCommand } from '../src/commands/help.command';

describe('helpCommand', () => {
  const projectRoot = import.meta.dir + '/..';

  test('returns inventory for opencode target (default)', async () => {
    const result = await helpCommand({
      projectRoot,
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('opencode');
  });

  test('returns inventory for claude target', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'claude',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('claude');
  });

  test('returns inventory for codex target', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'codex',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('codex');
  });

  test('returns inventory for agy target', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'agy',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.target).toBe('agy');
  });

  test('human output includes skills, subagents, and commands sections', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'opencode',
      output: 'human',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; message: string };
    expect(data.success).toBe(true);
    expect(data.message).toContain('Skills');
    expect(data.message).toContain('Subagents');
    expect(data.message).toContain('Commands');
  });

  test('handles non-existent target gracefully', async () => {
    const result = await helpCommand({
      projectRoot,
      target: 'nonexistent',
      output: 'json',
    });

    expect(result.code).toBe(0);
    const data = result.data as { success: boolean; inventory: { target: string; skills: string[]; agents: string[]; commands: string[] } };
    expect(data.success).toBe(true);
    expect(data.inventory.skills).toHaveLength(0);
    expect(data.inventory.agents).toHaveLength(0);
    expect(data.inventory.commands).toHaveLength(0);
  });
});
