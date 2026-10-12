import { describe, expect, test } from 'bun:test';
import { assembleContext } from '../../src/core/ccep/context-assembly';

describe('context assembly: fragmentos obligatorios (R06)', () => {
  test('un fragmento obligatorio nunca cede su lugar a uno opcional anterior en el orden de fuentes', () => {
    const result = assembleContext(
      [
        { source: 'ledger', content: 'L'.repeat(10) },
        { source: 'rules', id: 'inv-a', required: true, content: 'R'.repeat(8) },
        { source: 'scope', content: 'S'.repeat(10) },
      ],
      18,
    );
    expect(result.fragments.map((f) => f.source)).toEqual(['rules', 'ledger']);
    expect(result.omittedSources).toEqual(['scope']);
    expect(result.blocking).toEqual([]);
  });

  test('los bytes de un obligatorio de una fuente tardía se reservan antes que los opcionales anteriores', () => {
    const result = assembleContext(
      [
        { source: 'ledger', content: 'L'.repeat(10) },
        { source: 'scope', id: 'inv-late', required: true, content: 'S'.repeat(8) },
      ],
      12,
    );
    expect(result.fragments.map((f) => f.source)).toEqual(['scope']);
    expect(result.omittedSources).toEqual(['ledger']);
  });

  test('si los obligatorios no caben se reporta context_budget_exceeded con los elementos, sin omitirlos', () => {
    const result = assembleContext(
      [
        { source: 'rules', id: 'inv-b', required: true, content: 'B'.repeat(4) },
        { source: 'rules', id: 'inv-a', required: true, content: 'A'.repeat(4) },
        { source: 'ledger', content: 'x' },
      ],
      5,
    );
    expect(result.fragments.filter((f) => f.source === 'rules')).toHaveLength(2);
    expect(result.omittedSources).toEqual(['ledger']);
    expect(result.blocking).toEqual([
      { code: 'context_budget_exceeded', elements: ['inv-a', 'inv-b'], requiredBytes: 8, maxBytes: 5 },
    ]);
  });

  test('sin fragmentos obligatorios el comportamiento previo se conserva y no hay bloqueos', () => {
    const result = assembleContext([{ source: 'memory', content: 'memory' }], 3);
    expect(result.fragments).toEqual([]);
    expect(result.omittedSources).toEqual(['memory']);
    expect(result.blocking).toEqual([]);
  });
});
