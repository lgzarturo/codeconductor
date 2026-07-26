import { describe, expect, test } from 'bun:test';
import {
  CliError,
  ConfigConflictError,
  CredentialGuardError,
  ExitCode,
  UnsafeOperationError,
  UnsupportedProjectError,
  ValidationError,
  getExitCode,
} from '../../../src/cli/errors';

describe('cli/errors', () => {
  describe('ExitCode contract', () => {
    test('maps each named code to its documented number', () => {
      expect(ExitCode).toEqual({
        SUCCESS: 0,
        VALIDATION_ERROR: 1,
        UNSAFE_OPERATION: 2,
        UNSUPPORTED_PROJECT: 3,
        CONFIG_CONFLICT: 4,
        CREDENTIAL_LEAK: 5,
      });
    });
  });

  describe('CliError base class', () => {
    test('carries message, code and details', () => {
      const e = new CliError('base', ExitCode.SUCCESS, { extra: 1 });
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toBe('base');
      expect(e.code).toBe(ExitCode.SUCCESS);
      expect(e.details).toEqual({ extra: 1 });
      expect(e.name).toBe('CliError');
    });
  });

  describe('typed error subclasses', () => {
    const cases: Array<[new (m: string) => CliError, number, string]> = [
      [ValidationError, ExitCode.VALIDATION_ERROR, 'ValidationError'],
      [UnsafeOperationError, ExitCode.UNSAFE_OPERATION, 'UnsafeOperationError'],
      [UnsupportedProjectError, ExitCode.UNSUPPORTED_PROJECT, 'UnsupportedProjectError'],
      [ConfigConflictError, ExitCode.CONFIG_CONFLICT, 'ConfigConflictError'],
    ];

    for (const [Ctor, code, name] of cases) {
      test(`${name} is a CliError with code ${code}`, () => {
        const e = new Ctor('msg');
        expect(e).toBeInstanceOf(CliError);
        expect(e.code).toBe(code);
        expect(e.name).toBe(name);
        expect(e.message).toBe('msg');
      });
    }
  });

  describe('CredentialGuardError', () => {
    test('exposes the credential matches and the leak exit code', () => {
      const matches = [{ filePath: 'a.ts', line: 3, pattern: 'API_KEY', matched: 'API_KEY=xxxxxxxx' }];
      const e = new CredentialGuardError('leak', matches);
      expect(e).toBeInstanceOf(CliError);
      expect(e.code).toBe(ExitCode.CREDENTIAL_LEAK);
      expect(e.name).toBe('CredentialGuardError');
      expect(e.matches).toEqual(matches);
    });
  });

  describe('getExitCode', () => {
    test('happy path: returns the code of a CliError subclass', () => {
      expect(getExitCode(new ConfigConflictError('x'))).toBe(ExitCode.CONFIG_CONFLICT);
    });

    test('edge case: plain Error falls back to VALIDATION_ERROR', () => {
      expect(getExitCode(new Error('generic'))).toBe(ExitCode.VALIDATION_ERROR);
    });

    test('error case: non-error values fall back to VALIDATION_ERROR', () => {
      expect(getExitCode('a string')).toBe(ExitCode.VALIDATION_ERROR);
      expect(getExitCode(undefined)).toBe(ExitCode.VALIDATION_ERROR);
    });
  });
});
