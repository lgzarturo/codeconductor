import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCouncilPreset, loadPreset } from '../../../../src/core/presets/preset-loader';
import { isErr, isOk } from '../../../../src/utils/result';

const VALID_COUNCIL = `name: council
version: 0.1.0
description: test council
outputContract: v1
agents:
  - id: architect
    role: Architect
    context: repo-readonly
    modelHint: strong-reasoning
    focus: [architecture]
`;

let ROOT: string;

async function projectWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(ROOT, 'proj-'));
  const presetsDir = join(dir, '.codeconductor', 'presets');
  await mkdir(presetsDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(presetsDir, name), content);
  }
  return dir;
}

beforeAll(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'cc-preset-loader-'));
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('core/presets/preset-loader', () => {
  test('happy path: loads and validates a user preset from the config dir', async () => {
    const root = await projectWith({ 'council.yml': VALID_COUNCIL });
    const result = await loadPreset('council', root);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.data.name).toBe('council');
      expect(result.data.agents).toHaveLength(1);
    }
  });

  test('loadCouncilPreset resolves the bundled council preset by default', async () => {
    const root = await projectWith({ 'council.yml': VALID_COUNCIL });
    const result = await loadCouncilPreset(root);
    expect(isOk(result)).toBe(true);
  });

  test('error case: a missing preset returns a ValidationError', async () => {
    const root = await projectWith({});
    const result = await loadPreset('does-not-exist', root);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Preset not found');
    }
  });

  test('error case: a preset that fails schema validation returns an Invalid preset error', async () => {
    const root = await projectWith({ 'badpreset.yml': 'foo: bar\n' });
    const result = await loadPreset('badpreset', root);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Invalid preset');
    }
  });
});
