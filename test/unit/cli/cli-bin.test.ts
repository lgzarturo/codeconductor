import { describe, expect, test } from 'bun:test';
import { resolveCliBin, formatUsage } from '../../../src/utils/cli-bin';
import { renderHelp, COMMANDS } from '../../../src/cli/command-registry';
import { onboardingCommand } from '../../../src/commands/onboarding.command';
import { statusCommand } from '../../../src/commands/status.command';

describe('CLI binary resolution and usage formatting', () => {
  describe('resolveCliBin', () => {
    test('detects npx invocation via npm_lifecycle_event', () => {
      const bin = resolveCliBin(
        { npm_lifecycle_event: 'npx' } as NodeJS.ProcessEnv,
        ['/usr/bin/node', '/home/user/.npm/_npx/1234/node_modules/.bin/cc-codeconductor'],
      );
      expect(bin).toBe('npx cc-codeconductor');
    });

    test('detects npx invocation via npm_command exec', () => {
      const bin = resolveCliBin(
        { npm_command: 'exec' } as NodeJS.ProcessEnv,
        ['/usr/bin/node', '/tmp/cc-codeconductor'],
      );
      expect(bin).toBe('npx cc-codeconductor');
    });

    test('detects local dev run via main.ts in argv[1]', () => {
      const bin = resolveCliBin(
        {} as NodeJS.ProcessEnv,
        ['bun', '/path/to/src/cli/main.ts'],
      );
      expect(bin).toBe('bun run dev');
    });

    test('detects local dev run via npm_lifecycle_event dev', () => {
      const bin = resolveCliBin(
        { npm_lifecycle_event: 'dev', npm_lifecycle_script: 'bun run src/cli/main.ts' } as NodeJS.ProcessEnv,
        ['bun', '/path/to/dist/index.js'],
      );
      expect(bin).toBe('bun run dev');
    });

    test('detects installed cc-codeconductor binary', () => {
      const bin = resolveCliBin(
        {} as NodeJS.ProcessEnv,
        ['node', '/usr/local/bin/cc-codeconductor'],
      );
      expect(bin).toBe('cc-codeconductor');
    });

    test('detects installed codeconductor binary', () => {
      const bin = resolveCliBin(
        {} as NodeJS.ProcessEnv,
        ['node', '/usr/local/bin/codeconductor'],
      );
      expect(bin).toBe('codeconductor');
    });

    test('respects explicit CC_CLI_BIN override', () => {
      const bin = resolveCliBin(
        { CC_CLI_BIN: 'custom-cc' } as NodeJS.ProcessEnv,
        ['node', '/some/path'],
      );
      expect(bin).toBe('custom-cc');
    });

    test('defaults to cc-codeconductor when context is unknown', () => {
      const bin = resolveCliBin(
        {} as NodeJS.ProcessEnv,
        ['node', '/some/unknown/script.js'],
      );
      expect(bin).toBe('cc-codeconductor');
    });
  });

  describe('formatUsage', () => {
    test('replaces cc prefix with resolved bin', () => {
      expect(formatUsage('cc doctor', 'npx cc-codeconductor')).toBe('npx cc-codeconductor doctor');
      expect(formatUsage('cc setup --target <target>', 'bun run dev')).toBe('bun run dev setup --target <target>');
    });

    test('replaces cc-codeconductor prefix with resolved bin', () => {
      expect(formatUsage('cc-codeconductor doctor', 'npx cc-codeconductor')).toBe('npx cc-codeconductor doctor');
      expect(formatUsage('cc-codeconductor status', 'codeconductor')).toBe('codeconductor status');
    });
  });

  describe('renderHelp', () => {
    test('uses resolved bin in general help', () => {
      const helpNpx = renderHelp(undefined, undefined, false, 'npx cc-codeconductor');
      expect(helpNpx).toContain('Usage: npx cc-codeconductor <command> [options]');
      expect(helpNpx).toContain('Run `npx cc-codeconductor help <command>` for details.');
      expect(helpNpx).not.toContain('Usage: cc <command>');
      expect(helpNpx).not.toContain('Run `cc help');

      const helpDev = renderHelp(undefined, undefined, false, 'bun run dev');
      expect(helpDev).toContain('Usage: bun run dev <command> [options]');
      expect(helpDev).toContain('Run `bun run dev help <command>` for details.');
    });

    test('uses resolved bin in command-specific help', () => {
      const doctorHelp = renderHelp('doctor', undefined, false, 'npx cc-codeconductor');
      expect(doctorHelp).toContain('Usage:');
      expect(doctorHelp).toContain('  npx cc-codeconductor doctor');
      expect(doctorHelp).toContain('Run `npx cc-codeconductor help --all` for every command.');
      expect(doctorHelp).not.toContain('  cc doctor');
      expect(doctorHelp).not.toContain('Run `cc help');
    });

    test('all command usage lines in full help use resolved bin', () => {
      const allHelp = renderHelp(undefined, undefined, true, 'npx cc-codeconductor');
      expect(allHelp).not.toMatch(/^\s*cc\s+[a-z]/m);
      expect(allHelp).toContain('npx cc-codeconductor doctor');
      expect(allHelp).toContain('npx cc-codeconductor setup');
    });
  });

  describe('onboardingCommand and statusCommand hints', () => {
    test('onboarding output uses resolved bin instead of hardcoded cc', async () => {
      const prevEnv = process.env.CC_CLI_BIN;
      process.env.CC_CLI_BIN = 'npx cc-codeconductor';
      try {
        const result = await onboardingCommand(process.cwd());
        const output = (result.data as { output: string }).output;
        expect(output).toContain('npx cc-codeconductor status');
        expect(output).toContain('npx cc-codeconductor doctor');
        expect(output).toContain('npx cc-codeconductor update --check');
        expect(output).toContain('npx cc-codeconductor help');
        expect(output).not.toMatch(/\bcc doctor\b/);
        expect(output).not.toMatch(/\bcc status\b/);
      } finally {
        if (prevEnv !== undefined) process.env.CC_CLI_BIN = prevEnv;
        else delete process.env.CC_CLI_BIN;
      }
    });

    test('status output uses resolved bin instead of hardcoded cc doctor', async () => {
      const prevEnv = process.env.CC_CLI_BIN;
      process.env.CC_CLI_BIN = 'npx cc-codeconductor';
      try {
        const result = await statusCommand({ projectRoot: process.cwd(), output: 'human' });
        const output = (result.data as { output: string }).output;
        expect(output).toContain('Run `npx cc-codeconductor doctor` for diagnostics.');
        expect(output).not.toContain('Run `cc doctor` for diagnostics.');
      } finally {
        if (prevEnv !== undefined) process.env.CC_CLI_BIN = prevEnv;
        else delete process.env.CC_CLI_BIN;
      }
    });
  });
});
