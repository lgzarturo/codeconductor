/**
 * End-to-end CLI tests for the `ccep` command.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invokeCli } from '../helpers/invoke-cli';

let TEST_DIR: string;

async function runCli(args: string[], cwd = TEST_DIR) {
  return invokeCli(args, cwd);
}

describe('CLI: ccep command (end-to-end)', () => {
  beforeAll(async () => {
    TEST_DIR = await mkdtemp(join(tmpdir(), 'ccep-cli-test-'));
    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify({ name: 'ccep-cli-fixture', type: 'module' }),
    );
  });

  afterAll(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('ccep parse --command fix emits valid envelope JSON', async () => {
    const result = await runCli([
      'ccep',
      'parse',
      '--command',
      'fix',
      'login fails on Safari',
      '--output=json',
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.envelope.protocolVersion).toBe('ccep-1');
    expect(json.envelope.command).toBe('fix');
    expect(json.envelope.userRequest).toBe('login fails on Safari');
  });

  test('ccep profile council emits workflow profile JSON', async () => {
    const result = await runCli(['ccep', 'profile', 'council', '--output=json']);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.profile.command).toBe('council');
    expect(json.profile.phases.map((p: { id: string }) => p.id)).toContain('deliberation');
  });

  test('ccep resolve binds envelope to profile', async () => {
    const result = await runCli([
      'ccep',
      'resolve',
      '--command',
      'feature',
      'Add loyalty benefits',
      '--output=json',
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.context.envelope.command).toBe('feature');
    expect(json.context.profile.command).toBe('feature');
  });

  test('ccep parse rejects missing --command flag', async () => {
    const result = await runCli(['ccep', 'parse', 'some request', '--output=json']);

    expect(result.exitCode).not.toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(false);
  });

  test('ccep profile rejects unknown command', async () => {
    const result = await runCli(['ccep', 'profile', 'not-a-command', '--output=json']);

    expect(result.exitCode).not.toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(false);
  });

  test('ccep compile emits layered prompt for feature intake', async () => {
    const result = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--phase',
      'intake',
      '--role',
      'task-coach',
      'Add loyalty benefits',
      '--output=json',
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(true);
    expect(json.layers).toHaveLength(7);
    expect(json.prompt).toContain('Planner');
    expect(json.outputSchema).toBe('planner-output');
    expect(json.promptVersion).toBe('v1.0.0');
  });

  test.each([
    ['prompt', true, false],
    ['layers', false, true],
    ['full', true, true],
  ])('ccep compile --view=%s selects the requested representation', async (view, hasPrompt, hasLayers) => {
    const result = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--phase',
      'intake',
      '--role',
      'task-coach',
      `--view=${view}`,
      'Add loyalty benefits',
      '--output=json',
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(Object.hasOwn(json, 'prompt')).toBe(hasPrompt);
    expect(Object.hasOwn(json, 'layers')).toBe(hasLayers);
  });

  test('ccep compile rejects an unknown view', async () => {
    const result = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--view=summary',
      'Add loyalty benefits',
      '--output=json',
    ]);

    expect(result.exitCode).not.toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.success).toBe(false);
    expect(json.errors.join(' ')).toContain('Unknown compile view: summary');
  });

  test('ccep compile records structured telemetry only when requested', async () => {
    const projectRoot = await mkdtemp(join(TEST_DIR, 'telemetry-'));
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'telemetry-fixture', type: 'module' }),
    );
    const eventPath = join(projectRoot, '.codeconductor', 'events.jsonl');

    const unrecorded = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--phase',
      'intake',
      'Add loyalty benefits',
      '--output=json',
    ], projectRoot);
    expect(unrecorded.exitCode).toBe(0);
    expect(existsSync(eventPath)).toBe(false);

    const recorded = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--phase',
      'intake',
      '--record-telemetry',
      '--execution-id=exec-1',
      '--task-id=task-1',
      '--context-strategy=artifact',
      '--view=prompt',
      'Add loyalty benefits',
      '--output=json',
    ], projectRoot);
    expect(recorded.exitCode).toBe(0);

    const lines = (await readFile(eventPath, 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event.type).toBe('context.compiled');
    expect(event.payload).toMatchObject({
      workflow: 'feature',
      phase: 'intake',
      agent: 'task-coach',
      executionId: 'exec-1',
      taskId: 'task-1',
      contextStrategy: 'artifact',
      promptVersion: 'v1.0.0',
      view: 'prompt',
      source: 'compiler',
      success: true,
      provider: 'unknown',
      model: 'unknown',
      effort: 'unknown',
      sessionId: 'unknown',
      parentSessionId: 'unknown',
      requestedModel: 'unknown',
      effectiveModel: 'unknown',
      inputTokens: 'unknown',
      outputTokens: 'unknown',
      reasoningTokens: 'unknown',
      cacheReadTokens: 'unknown',
      cacheWriteTokens: 'unknown',
      cachedTokens: 'unknown',
      contextTokensEstimate: 'unknown',
      filesRead: 'unknown',
      uniqueFilesRead: 'unknown',
      repeatedFileReads: 'unknown',
      toolCalls: 'unknown',
      retries: 'unknown',
      compactions: 'unknown',
      modelSwitches: 'unknown',
    });
    expect(event.payload.promptBytes).toBeGreaterThan(0);
    expect(event.payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(event.payload.layerBytes).toMatchObject({
      system: expect.any(Number),
      task: expect.any(Number),
      output_schema: expect.any(Number),
    });
  });

  test('ccep compile rejects an invalid telemetry context strategy', async () => {
    const projectRoot = await mkdtemp(join(TEST_DIR, 'context-strategy-'));
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'context-strategy-fixture', type: 'module' }),
    );
    const eventPath = join(projectRoot, '.codeconductor', 'events.jsonl');

    const invalid = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--record-telemetry',
      '--context-strategy=anything',
      'Add loyalty benefits',
      '--output=json',
    ], projectRoot);

    expect(invalid.exitCode).not.toBe(0);
    const invalidJson = JSON.parse(invalid.stdout);
    expect(invalidJson.success).toBe(false);
    expect(invalidJson.errors.join(' ')).toContain('Invalid context strategy: anything');
    expect(invalidJson.errors.join(' ')).toContain('sticky, isolated, artifact, compact, fork, full');
    expect(existsSync(eventPath)).toBe(false);
  });

  test('ccep compile records an omitted telemetry context strategy as unknown', async () => {
    const projectRoot = await mkdtemp(join(TEST_DIR, 'omitted-context-strategy-'));
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'omitted-context-strategy-fixture', type: 'module' }),
    );
    const eventPath = join(projectRoot, '.codeconductor', 'events.jsonl');

    const omitted = await runCli([
      'ccep',
      'compile',
      '--command',
      'feature',
      '--record-telemetry',
      'Add loyalty benefits',
      '--output=json',
    ], projectRoot);

    expect(omitted.exitCode).toBe(0);
    const lines = (await readFile(eventPath, 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).payload.contextStrategy).toBe('unknown');
  });

  test('ccep validate accepts valid implementer output', async () => {
    const payload = JSON.stringify({
      status: 'success',
      confidence: 0.9,
      warnings: [],
      artifacts: [],
      next_actions: [],
      filesChanged: [{ path: 'src/a.ts', summary: 'change' }],
      tests: { runner: 'bun test', result: 'passed' },
    });

    const result = await runCli([
      'ccep',
      'validate',
      '--command',
      'feature',
      '--phase',
      'implement',
      '--role',
      'implementer',
      '--output=json',
      payload,
    ]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.valid).toBe(true);
    expect(json.schema).toBe('implementer-output');
  });

  test('ccep validate rejects invalid reviewer output', async () => {
    const result = await runCli([
      'ccep',
      'validate',
      '--command',
      'feature',
      '--phase',
      'review',
      '--role',
      'reviewer',
      '--output=json',
      '{"status":"pass"}',
    ]);

    expect(result.exitCode).not.toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.valid).toBe(false);
    expect(json.schema).toBe('review-report');
  });
});
