import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CCEP_COMMANDS,
  parseCommand,
  parseCommandAsync,
} from '../../../../src/core/ccep/command-parser';

let ROOT: string;

async function projectDir(pkg?: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(ROOT, 'proj-'));
  if (pkg) {
    await writeFile(join(dir, 'package.json'), JSON.stringify(pkg));
  }
  return dir;
}

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-command-parser-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/ccep/command-parser', () => {
  test('CCEP_COMMANDS lists all nineteen workflow commands', () => {
    expect(CCEP_COMMANDS).toContain('feature');
    expect(CCEP_COMMANDS).toContain('council');
    expect(CCEP_COMMANDS).toContain('iterative');
    expect(CCEP_COMMANDS).toContain('backlog');
    expect(CCEP_COMMANDS).toContain('security');
    expect(CCEP_COMMANDS).toHaveLength(19);
  });

  describe('parseCommand', () => {
    test('builds a valid CCEP-1 envelope with the command defaults', async () => {
      const dir = await projectDir({ name: 'test-proj' });
      const envelope = parseCommand('feature', 'add endpoint', dir);
      expect(envelope.protocolVersion).toBe('ccep-1');
      expect(envelope.command).toBe('feature');
      expect(envelope.projectId).toBe('test-proj');
      expect(envelope.userRequest).toBe('add endpoint');
      expect(envelope.constraints).toEqual({
        outputFormat: 'taskcard',
        needConfirmation: true,
        riskThreshold: 'medium',
      });
      expect(envelope.executionPolicy).toEqual({ modelMode: 'structured', maxVariance: 'low' });
    });

    test('detects nextjs/react from dependencies', async () => {
      const dir = await projectDir({ name: 'web', dependencies: { next: '14', react: '18' } });
      const envelope = parseCommand('review', 'check', dir);
      expect(envelope.repoContext.stack).toContain('typescript');
      expect(envelope.repoContext.stack).toContain('nextjs');
      expect(envelope.repoContext.stack).toContain('react');
      // review carries its own constraint defaults
      expect(envelope.constraints.outputFormat).toBe('verdict');
    });

    test('without package.json the stack is unknown and projectId falls back to the dir name', async () => {
      const dir = await projectDir();
      const envelope = parseCommand('fix', 'bug', dir);
      expect(envelope.repoContext.stack).toEqual(['unknown']);
      expect(typeof envelope.projectId).toBe('string');
      expect(envelope.projectId.length).toBeGreaterThan(0);
    });

    test('rejects an unknown command', async () => {
      const dir = await projectDir({ name: 'x' });
      // @ts-expect-error — exercising runtime validation with an invalid command
      expect(() => parseCommand('not-a-command', 'x', dir)).toThrow();
    });
  });

  describe('parseCommandAsync', () => {
    test('hydrates the stack from project detection', async () => {
      const dir = await projectDir({ name: 'node-proj' });
      const envelope = await parseCommandAsync('feature', 'add', dir);
      expect(envelope.command).toBe('feature');
      expect(Array.isArray(envelope.repoContext.stack)).toBe(true);
      expect(envelope.repoContext.stack.length).toBeGreaterThan(0);
    });
  });
});
