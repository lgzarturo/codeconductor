import { describe, expect, test } from 'bun:test';
import { evaluateOddAdoption, type OddAdoptionSample } from '../src/core/evaluation/odd-adoption';

const baseline: OddAdoptionSample[] = [
  { id: 'one', route: 'openspec', acceptancePassed: true, testsPassed: true, findings: 2, contextBytes: 1_000, costUsd: 0.20 },
  { id: 'two', route: 'openspec', acceptancePassed: true, testsPassed: true, findings: 1, contextBytes: 1_200, costUsd: 0.24 },
];

const odd: OddAdoptionSample[] = [
  { id: 'one', route: 'tracked', acceptancePassed: true, testsPassed: true, findings: 1, contextBytes: 700, costUsd: 0.16 },
  { id: 'two', route: 'tracked', acceptancePassed: true, testsPassed: true, findings: 1, contextBytes: 800, costUsd: 0.18 },
];

describe('ODD adoption evaluation', () => {
  test('recommends ODD only for paired samples with non-inferior quality and less context', () => {
    expect(evaluateOddAdoption([...baseline, ...odd])).toMatchObject({
      recommendation: 'eligible',
      reason: 'ODD is non-inferior on quality and uses less context.',
      baseline: { sampleCount: 2, acceptanceRate: 1, testPassRate: 1, averageFindings: 1.5 },
      odd: { sampleCount: 2, acceptanceRate: 1, testPassRate: 1, averageFindings: 1 },
      contextReduced: true,
      cost: { status: 'reduced' },
    });
  });

  test('keeps ODD opt-in when quality regresses', () => {
    const result = evaluateOddAdoption([
      ...baseline,
      { ...odd[0], acceptancePassed: false },
      odd[1],
    ]);

    expect(result.recommendation).toBe('opt-in');
    expect(result.reasons).toContain('ODD acceptance rate is below the OpenSpec baseline.');
  });

  test('keeps ODD opt-in without a paired baseline or measured context reduction', () => {
    const result = evaluateOddAdoption([
      baseline[0],
      { ...odd[0], contextBytes: baseline[0].contextBytes },
    ]);

    expect(result.recommendation).toBe('opt-in');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'Paired ODD and OpenSpec samples are required.',
      'ODD must reduce average context bytes before it is recommended by default.',
    ]));
  });

  test('rejects duplicate sample IDs because they are not independent pairs', () => {
    const result = evaluateOddAdoption([
      baseline[0],
      { ...baseline[0], contextBytes: 1_100 },
      odd[0],
      { ...odd[0], contextBytes: 600 },
    ]);

    expect(result.recommendation).toBe('opt-in');
    expect(result.reasons).toContain('Paired ODD and OpenSpec samples are required.');
  });

  test('reports unavailable cost without treating it as a saving', () => {
    const result = evaluateOddAdoption([
      ...baseline.map(({ costUsd: _costUsd, ...sample }) => sample),
      ...odd.map(({ costUsd: _costUsd, ...sample }) => sample),
    ]);

    expect(result.cost).toEqual({ status: 'unknown' });
    expect(result.recommendation).toBe('eligible');
  });
});
