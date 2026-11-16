import { describe, expect, test } from 'bun:test';
import { recommendCorrection } from '../src/core/ask/recommend-correction';
import { correctCommand } from '../src/commands/correct.command';

describe('recommendCorrection', () => {
  test('routes consumer bun run dev mistakes to the consumer-cli test', () => {
    const rec = recommendCorrection(
      'SessionStart told the agent bun run dev and got Script not found "dev"',
    );
    expect(rec.layer).toBe('static-analysis');
    expect(rec.command).toContain('consumer-cli-invocation.test.ts');
    expect(rec.forbidProse).toBe(true);
  });

  test('routes hand-edited council stubs to check:council-redirect', () => {
    const rec = recommendCorrection('someone hand-edit council stub again');
    expect(rec.layer).toBe('static-analysis');
    expect(rec.command).toBe('bun run check:council-redirect');
    expect(rec.forbidProse).toBe(true);
  });

  test('routes out-of-scope diffs to the scope guard', () => {
    const rec = recommendCorrection('file outside scope / adjacent code changed');
    expect(rec.layer).toBe('verification');
    expect(rec.command).toContain('scope-guard');
    expect(rec.forbidProse).toBe(true);
  });

  test('routes "documenta esto en AGENTS" away from automatic prose', () => {
    const rec = recommendCorrection('documenta esto en AGENTS.md');
    expect(rec.layer).toBe('prose');
    expect(rec.forbidProse).toBe(false);
    expect(rec.command).toContain('refuse');
  });

  test('prefers the consumer-cli owner when documenting that mistake', () => {
    const rec = recommendCorrection(
      'document bun run dev consumer rule in AGENTS.md',
    );
    expect(rec.layer).toBe('static-analysis');
    expect(rec.command).toContain('consumer-cli-invocation.test.ts');
    expect(rec.forbidProse).toBe(true);
  });

  test('routes lint shortcuts to bun run lint', () => {
    const rec = recommendCorrection('agent used as unknown as and nested import');
    expect(rec.layer).toBe('static-analysis');
    expect(rec.command).toBe('bun run lint');
  });
});

describe('correctCommand', () => {
  test('returns executed:false and does not start a workflow', async () => {
    const result = await correctCommand({
      signal: 'council redirect drifted',
      output: 'json',
    });
    expect(result.code).toBe(0);
    const data = result.data as {
      executed: boolean;
      recommended: { layer: string };
      message: string;
    };
    expect(data.executed).toBe(false);
    expect(data.recommended.layer).toBe('static-analysis');
    expect(data.message).toContain('Do not start a workflow');
  });

  test('rejects an empty signal', async () => {
    const result = await correctCommand({ signal: '  ', output: 'human' });
    expect(result.code).toBe(1);
  });
});
