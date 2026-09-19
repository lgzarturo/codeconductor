import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../../../package.json';
import {
  RELEASE_DOCS,
  synchronizeReleaseDocContent,
} from '../../../scripts/sync-release-docs';

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

    const output = synchronizeReleaseDocContent('docs/current-status.md', input, '1.4.1');
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

    const output = synchronizeReleaseDocContent('docs/current-status.md', input, '1.5.0');
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

    const output = synchronizeReleaseDocContent('docs/current-status.md', input, '2.0.0');
    expect(output).toContain('**Published package version:** `2.0.0` — current stable line: `2.0.x`');
    expect(output).toContain('Available in stable 2.0.x');
  });

  test('synchronizes active release references for patch, minor, and major bumps', () => {
    const input = [
      'Published package is **1.4.2** (current stable line: **1.4.x**).',
      'Shipped in the 1.4.x stable line:',
      'Published **1.4.2** declares two production dependencies.',
      'cc["cc-codeconductor@1.4.2"]',
      'Published package: **1.4.x (current stable: 1.4.2)**.',
      'Historical reference: v1.3.0.',
    ].join('\n');

    for (const [version, line] of [['1.4.3', '1.4.x'], ['1.5.0', '1.5.x'], ['2.0.0', '2.0.x']]) {
      const output = synchronizeReleaseDocContent('README.md', input, version);
      expect(output).toContain(`Published package is **${version}** (current stable line: **${line}**).`);
      expect(output).toContain(`Shipped in the ${line} stable line:`);
      expect(output).toContain(`Published **${version}** declares`);
      expect(output).toContain(`cc["cc-codeconductor@${version}"]`);
      expect(output).toContain(`Published package: **${line} (current stable: ${version})**.`);
      expect(output).toContain('Historical reference: v1.3.0.');
    }
  });

  test('repository release documentation is synchronized with package.json', async () => {
    for (const documentPath of RELEASE_DOCS) {
      const content = await readFile(join(import.meta.dir, '../../..', documentPath), 'utf8');
      expect(synchronizeReleaseDocContent(documentPath, content, packageJson.version)).toBe(content);
    }
  });

  test('README exposes the current maintenance workflow', async () => {
    const readme = await readFile(join(import.meta.dir, '../../..', 'README.md'), 'utf8');
    for (const command of ['setup', 'status', 'version', 'doctor', 'update', 'migrate']) {
      expect(readme).toContain(`cc-codeconductor ${command}`);
    }
  });

  test('release.sh dry-run logs status document update', async () => {
    const proc = Bun.spawnSync(['bash', 'release.sh', 'patch', '--dry-run'], {
      cwd: join(import.meta.dir, '../../..'),
    });
    expect(proc.exitCode).toBe(0);
    const stdout = Buffer.from(proc.stdout).toString('utf-8');
    expect(stdout).toContain('docs/current-status.md');
  });

  test('release.sh dry-run computes patch, minor, and major versions', () => {
    for (const [type, expected] of [['patch', '1.4.3'], ['minor', '1.5.0'], ['major', '2.0.0']]) {
      const proc = Bun.spawnSync(['bash', 'release.sh', type, '--dry-run'], {
        cwd: join(import.meta.dir, '../../..'),
      });
      expect(proc.exitCode).toBe(0);
      expect(Buffer.from(proc.stdout).toString('utf-8')).toContain(`New version: ${expected}`);
    }
  });
});
