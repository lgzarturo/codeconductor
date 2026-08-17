import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import packageJson from '../package.json';
import { parseArgs, routeCommand } from '../src/cli/router';

const ROOT = import.meta.dir + '/..';

async function route(argv: string[]) {
  return routeCommand(parseArgs(argv), ROOT);
}

describe('CC-08 CLI contracts', () => {
  for (const [command, subcommand] of [
    ['install', 'nonsense'],
    ['product', 'nonsense'],
    ['orchestrate', 'nonsense'],
    ['ccep', 'nonsense'],
    ['scorecard', 'nonsense'],
    ['openspec', 'nonsense'],
  ] as const) {
    test(`${command} rejects unknown subcommand ${subcommand}`, async () => {
      const result = await route([command, subcommand, '--output=json']);
      expect(result.code).toBe(1);
      const data = result.data as { success: boolean; errors: string[] };
      expect(data.success).toBe(false);
      expect(data.errors.join(' ')).toMatch(/unknown subcommand/i);
      expect(data.errors.join(' ')).toContain(subcommand);
    });
  }

  test('rejects an unsupported global output mode', async () => {
    const result = await route(['detect', '--output=xml']);
    expect(result.code).toBe(1);
    expect((result.data as { errors: string[] }).errors.join(' ')).toMatch(
      /output.*json.*human/i,
    );
  });

  test('rejects invalid SEO enum and numeric options before network work', async () => {
    for (const argv of [
      ['seo', 'audit', '--url', 'https://example.com', '--format=xml'],
      ['seo', 'audit', '--url', 'https://example.com', '--fail-on=nope'],
      ['seo', 'audit', '--url', 'https://example.com', '--delay=nope'],
    ]) {
      const result = await route(argv);
      expect(result.code).toBe(1);
      expect((result.data as { success: boolean }).success).toBe(false);
    }
  });

  test('help and cc-help have distinct contracts', async () => {
    const generic = await route(['help']);
    expect(generic.code).toBe(0);
    expect(generic.data).toEqual({
      success: true,
      command: 'help',
      help: expect.stringContaining('CodeConductor CLI'),
    });
    expect(generic.data).not.toHaveProperty('inventory');

    const helpWithTarget = await route(['help', '--target=opencode', '--output=json']);
    expect(helpWithTarget.code).toBe(0);
    expect(helpWithTarget.data).not.toHaveProperty('inventory');
    expect((helpWithTarget.data as { help?: string }).help).toContain('CodeConductor CLI');

    const inventory = await route(['cc-help', '--target=opencode', '--output=json']);
    expect(inventory.code).toBe(0);
    const data = inventory.data as {
      command: string;
      inventory: { target: string };
    };
    expect(data.command).toBe('cc-help');
    expect(data.inventory.target).toBe('opencode');
  });

  test('canonical status document tracks the published package version', async () => {
    const status = await readFile(join(ROOT, 'docs/current-status.md'), 'utf-8');
    expect(status).toContain(`Published package version:** \`${packageJson.version}\``);
    expect(status).toMatch(/implemented, unreleased/i);
    expect(status).toMatch(/experimental library API/i);
    expect(status).toMatch(/planned/i);
  });
});
