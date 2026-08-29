import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CCEP_COMMANDS,
  parseCommand,
  type WorkflowCommand,
} from '../../src/core/ccep/command-parser';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');

describe('ccep command-parser', () => {
  test('exports all 19 supported workflow commands', () => {
    expect(CCEP_COMMANDS).toHaveLength(19);
    expect(CCEP_COMMANDS).toContain('feature');
    expect(CCEP_COMMANDS).toContain('fix');
    expect(CCEP_COMMANDS).toContain('council');
    expect(CCEP_COMMANDS).toContain('iterative');
    expect(CCEP_COMMANDS).toContain('explore');
    expect(CCEP_COMMANDS).toContain('triage');
    expect(CCEP_COMMANDS).toContain('openspec');
    expect(CCEP_COMMANDS).toContain('backlog');
    expect(CCEP_COMMANDS).toContain('pagespeed');
  });

  test('uses explicit command from slash — not inferred from user text', () => {
    const userRequest = 'fix the login bug on Safari';

    const fixEnvelope = parseCommand('fix', userRequest, PROJECT_ROOT);
    const featureEnvelope = parseCommand('feature', userRequest, PROJECT_ROOT);

    expect(fixEnvelope.command).toBe('fix');
    expect(featureEnvelope.command).toBe('feature');
    expect(fixEnvelope.userRequest).toBe(userRequest);
    expect(featureEnvelope.userRequest).toBe(userRequest);
  });

  test('produces a valid CCEP-1 envelope with protocol version', () => {
    const envelope = parseCommand('feature', 'CRUD for loyalty benefits', PROJECT_ROOT);

    expect(envelope.protocolVersion).toBe('ccep-1');
    expect(envelope.command).toBe('feature');
    expect(envelope.userRequest).toBe('CRUD for loyalty benefits');
    expect(envelope.projectId).toBeString();
    expect(envelope.repoContext).toBeObject();
    expect(envelope.constraints.outputFormat).toBe('taskcard');
    expect(envelope.executionPolicy.modelMode).toBe('structured');
    expect(envelope.executionPolicy.maxVariance).toBe('low');
  });

  test('applies command-specific default constraints', () => {
    const review = parseCommand('review', 'PR #42', PROJECT_ROOT);
    const council = parseCommand('council', 'Add auth module', PROJECT_ROOT);

    expect(review.constraints.outputFormat).toBe('verdict');
    expect(council.constraints.needConfirmation).toBe(true);
  });

  test('rejects invalid workflow command', () => {
    expect(() =>
      parseCommand('unknown-workflow' as WorkflowCommand, 'test', PROJECT_ROOT),
    ).toThrow();
  });

  test('hydrates repoContext from project root when package.json exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ccep-parser-'));
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'loyalty-app', dependencies: { next: '15.0.0' } }),
    );

    const envelope = parseCommand('feature', 'Add benefits CRUD', dir);

    expect(envelope.projectId).toBe('loyalty-app');
    expect(envelope.repoContext.stack).toContain('typescript');
  });
});
