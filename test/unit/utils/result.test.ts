import { describe, expect, test } from 'bun:test';
import {
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
  type Result,
} from '../../../src/utils/result';

describe('result', () => {
  describe('ok / err constructors', () => {
    test('ok wraps a success value', () => {
      const r = ok(42);
      expect(r).toEqual({ success: true, data: 42 });
    });

    test('err wraps an error value', () => {
      const e = new Error('boom');
      const r = err(e);
      expect(r).toEqual({ success: false, error: e });
    });
  });

  describe('isOk / isErr', () => {
    test('isOk is true for ok and false for err', () => {
      expect(isOk(ok(1))).toBe(true);
      expect(isOk(err('x'))).toBe(false);
    });

    test('isErr is true for err and false for ok', () => {
      expect(isErr(err('x'))).toBe(true);
      expect(isErr(ok(1))).toBe(false);
    });
  });

  describe('map', () => {
    test('happy path: transforms the success value', () => {
      const r = map(ok(2), (n) => n * 10);
      expect(r).toEqual({ success: true, data: 20 });
    });

    test('error case: leaves an err untouched', () => {
      const original: Result<number, string> = err('fail');
      const r = map(original, (n) => n * 10);
      expect(r).toEqual({ success: false, error: 'fail' });
    });
  });

  describe('mapErr', () => {
    test('happy path: transforms the error value', () => {
      const r = mapErr(err('fail'), (e) => `${e}!`);
      expect(r).toEqual({ success: false, error: 'fail!' });
    });

    test('ok case: leaves an ok untouched', () => {
      const original: Result<number, string> = ok(5);
      const r = mapErr(original, (e) => `${e}!`);
      expect(r).toEqual({ success: true, data: 5 });
    });
  });

  describe('unwrap', () => {
    test('happy path: returns the value for ok', () => {
      expect(unwrap(ok('value'))).toBe('value');
    });

    test('error case: throws the wrapped error for err', () => {
      const e = new Error('nope');
      expect(() => unwrap(err(e))).toThrow(e);
    });
  });

  describe('unwrapOr', () => {
    test('happy path: returns the value for ok', () => {
      expect(unwrapOr(ok(1), 99)).toBe(1);
    });

    test('error case: returns the default for err', () => {
      expect(unwrapOr(err('x') as Result<number, string>, 99)).toBe(99);
    });
  });
});
