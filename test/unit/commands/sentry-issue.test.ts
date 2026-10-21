import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, routeCommand } from '../../../src/cli/router';
import { extractScopeFiles } from '../../../src/core/sentry/sentry-context-enricher';

const BODY = {
  issueId: 'SENTRY-1',
  title: 'TypeError in auth login',
  culprit: 'AuthController.login (src/controllers/auth.ts:18)',
  filename: 'src/controllers/auth.ts',
  stackTrace: [
    { filename: 'src/controllers/auth.ts', function: 'login', lineNo: 18, context: [] },
    { filename: 'src/services/user.ts', function: 'findById', lineNo: 42, context: [] },
    { filename: 'src/services/user.ts', function: 'findById', lineNo: 43, context: [] },
    { filename: 'site-packages/flask/app.py', function: 'wsgi', lineNo: 1, context: [] },
    { filename: '<frozen importlib>', function: 'exec', lineNo: 1, context: [] },
  ],
  environment: 'production',
};

const SECRET = 'test-sentry-secret';

describe('sentry issue intake', () => {
  let dir: string;

  beforeEach(async () => {
    dir = resolve(tmpdir(), `cc-sentry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'body.json'), JSON.stringify(BODY));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('extractScopeFiles dedupes project frames and drops vendor noise', () => {
    expect(extractScopeFiles(JSON.stringify(BODY))).toEqual([
      'src/controllers/auth.ts',
      'src/services/user.ts',
    ]);
    expect(extractScopeFiles('{nope')).toEqual([]);
  });

  test('sentry issue emits a TaskCard draft with scope files', async () => {
    const result = await routeCommand(
      parseArgs(['sentry', 'issue', '--input', '@body.json', '--skip-verify', '--output=json']),
      dir,
    );
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({
      command: 'sentry issue',
      card: { Title: 'TypeError in auth login', Type: 'fix', Risk: 'high' },
      scopeFiles: ['src/controllers/auth.ts', 'src/services/user.ts'],
    });
    const human = await routeCommand(
      parseArgs(['sentry', 'issue', '--input', '@body.json', '--skip-verify']),
      dir,
    );
    expect(human.code).toBe(0);
    expect((human.data as { output: string }).output).toContain('TypeError in auth login');
  });

  test('signed webhooks verify; tampered signatures fail', async () => {
    const raw = JSON.stringify(BODY);
    await writeFile(join(dir, 'signed.json'), raw);
    const signature = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
    const ok = await routeCommand(
      parseArgs(['sentry', 'issue', '--input', '@signed.json', '--signature', signature, '--secret', SECRET]),
      dir,
    );
    expect(ok.code).toBe(0);
    const tampered = await routeCommand(
      parseArgs(['sentry', 'issue', '--input', '@signed.json', '--signature', 'sha256=00', '--secret', SECRET]),
      dir,
    );
    expect(tampered.code).toBe(1);
  });

  test('unsigned intake without skip-verify is rejected', async () => {
    const result = await routeCommand(parseArgs(['sentry', 'issue', '--input', '@body.json']), dir);
    expect(result.code).toBe(1);
  });

  test('missing input and invalid payloads error cleanly', async () => {
    expect((await routeCommand(parseArgs(['sentry', 'issue', '--skip-verify']), dir)).code).toBe(1);
    await writeFile(join(dir, 'bad.json'), '{"nope":true}');
    const bad = await routeCommand(
      parseArgs(['sentry', 'issue', '--input', '@bad.json', '--skip-verify']),
      dir,
    );
    expect(bad.code).toBe(1);
  });
});
