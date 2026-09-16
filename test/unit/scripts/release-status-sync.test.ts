import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function updateStatusDocContent(content: string, newVersion: string): string {
  const [major, minor] = newVersion.split('.');
  const stableLine = `${major}.${minor}`;
  let updated = content.replace(
    /\*\*Published package version:\*\* `[^`]+` — current stable line: `[^`]+`/,
    `**Published package version:** \`${newVersion}\` — current stable line: \`${stableLine}.x\``,
  );
  updated = updated.replace(
    /Available in stable \d+\.\d+\.x/g,
    `Available in stable ${stableLine}.x`,
  );
  return updated;
}

describe('release status document synchronization', () => {
  test('updates published version and stable line for patch release', () => {
    const input = [
      '# Current Product Status',
      '',
      '**Published package version:** `1.4.0` — current stable line: `1.4.x` (from',
      '`package.json`)',
      '',
      '| Capability | Repository status | Available in stable 1.4.x |',
    ].join('\n');

    const output = updateStatusDocContent(input, '1.4.1');
    expect(output).toContain('**Published package version:** `1.4.1` — current stable line: `1.4.x`');
    expect(output).toContain('Available in stable 1.4.x');
  });

  test('updates published version and stable line for minor release', () => {
    const input = [
      '# Current Product Status',
      '',
      '**Published package version:** `1.4.0` — current stable line: `1.4.x` (from',
      '`package.json`)',
      '',
      '| Capability | Repository status | Available in stable 1.4.x |',
    ].join('\n');

    const output = updateStatusDocContent(input, '1.5.0');
    expect(output).toContain('**Published package version:** `1.5.0` — current stable line: `1.5.x`');
    expect(output).toContain('Available in stable 1.5.x');
  });

  test('updates published version and stable line for major release', () => {
    const input = [
      '# Current Product Status',
      '',
      '**Published package version:** `1.4.0` — current stable line: `1.4.x` (from',
      '`package.json`)',
      '',
      '| Capability | Repository status | Available in stable 1.4.x |',
    ].join('\n');

    const output = updateStatusDocContent(input, '2.0.0');
    expect(output).toContain('**Published package version:** `2.0.0` — current stable line: `2.0.x`');
    expect(output).toContain('Available in stable 2.0.x');
  });

  test('release.sh dry-run logs status document update', async () => {
    const proc = Bun.spawnSync(['bash', 'release.sh', 'patch', '--dry-run'], {
      cwd: join(import.meta.dir, '../../..'),
    });
    expect(proc.exitCode).toBe(0);
    const stdout = Buffer.from(proc.stdout).toString('utf-8');
    expect(stdout).toContain('docs/current-status.md');
  });
});
