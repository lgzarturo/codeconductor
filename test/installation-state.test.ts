import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  getManagedFileStatus,
  recordManagedFiles,
  readInstallationState,
} from '../src/core/install/installation-state';

const ROOT = resolve(import.meta.dir, 'installation-state-tmp');

describe('installation state', () => {
  beforeEach(async () => {
    await rm(ROOT, { recursive: true, force: true });
    await mkdir(join(ROOT, '.codeconductor', 'presets'), { recursive: true });
  });

  afterEach(async () => {
    await rm(ROOT, { recursive: true, force: true });
  });

  test('records a SHA-256 baseline and detects later local edits', async () => {
    const council = join(ROOT, '.codeconductor', 'presets', 'council.yml');
    await writeFile(council, 'name: default\n');

    await recordManagedFiles(ROOT, [council], { cliVersion: '1.3.0' });

    const state = await readInstallationState(ROOT);
    expect(state?.managedFiles['.codeconductor/presets/council.yml']?.installedHash)
      .toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await getManagedFileStatus(ROOT, council, state!)).toBe('unchanged');

    await writeFile(council, 'name: customized\n');
    expect(await getManagedFileStatus(ROOT, council, state!)).toBe('modified');
  });

  test('does not invent a baseline for a file CodeConductor did not write', async () => {
    const council = join(ROOT, '.codeconductor', 'presets', 'council.yml');
    await writeFile(council, 'name: pre-existing-customization\n');
    await recordManagedFiles(ROOT, [], { cliVersion: '1.3.0' });
    const state = await readInstallationState(ROOT);
    expect(state?.managedFiles['.codeconductor/presets/council.yml']).toBeUndefined();
    expect(await getManagedFileStatus(ROOT, council, state!)).toBe('unknown');
  });
});
