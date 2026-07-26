import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test';
import { Logger } from '../../../src/utils/logger';

const logSpy = spyOn(console, 'log');
const errorSpy = spyOn(console, 'error');
const warnSpy = spyOn(console, 'warn');

afterEach(() => {
  logSpy.mockClear();
  errorSpy.mockClear();
  warnSpy.mockClear();
});

afterAll(() => {
  // Restore the globals so the spies do not leak into other test files that
  // share the Bun test process.
  logSpy.mockRestore();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

function lastLog(): string {
  const calls = logSpy.mock.calls;
  return String(calls[calls.length - 1]?.[0]);
}

describe('utils/logger', () => {
  describe('json mode', () => {
    const logger = new Logger('json');

    test('success emits a structured JSON envelope', () => {
      logger.success('init', { created: true });
      expect(JSON.parse(lastLog())).toEqual({ success: true, command: 'init', data: { created: true } });
    });

    test('error emits a structured JSON envelope on stdout', () => {
      logger.error('detect', ['bad', 'worse']);
      expect(JSON.parse(lastLog())).toEqual({ success: false, command: 'detect', errors: ['bad', 'worse'] });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    test('log wraps a message', () => {
      logger.log('hello');
      expect(JSON.parse(lastLog())).toEqual({ message: 'hello' });
    });

    test('warn wraps a warning', () => {
      logger.warn('careful');
      expect(JSON.parse(lastLog())).toEqual({ warning: 'careful' });
    });

    test('table serialises the whole object', () => {
      logger.table({ a: 1, b: [2, 3] });
      expect(JSON.parse(lastLog())).toEqual({ a: 1, b: [2, 3] });
    });
  });

  describe('human mode', () => {
    const logger = new Logger('human');

    test('success prints an object as pretty JSON', () => {
      logger.success('init', { created: true });
      expect(lastLog()).toContain('"created": true');
    });

    test('success with no data prints nothing', () => {
      logger.success('init');
      expect(logSpy).not.toHaveBeenCalled();
    });

    test('error writes each line to stderr', () => {
      logger.error('detect', ['line1', 'line2']);
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy.mock.calls[0]?.[0]).toBe('line1');
    });

    test('warn writes to console.warn', () => {
      logger.warn('careful');
      expect(warnSpy).toHaveBeenCalledWith('careful');
    });

    test('table prints key/value lines and joins arrays', () => {
      logger.table({ langs: ['ts', 'js'] });
      expect(lastLog()).toBe('  langs: ts, js');
    });
  });

  describe('setMode', () => {
    test('switches output format at runtime', () => {
      const logger = new Logger('human');
      logger.setMode('json');
      logger.log('switched');
      expect(JSON.parse(lastLog())).toEqual({ message: 'switched' });
    });
  });
});
