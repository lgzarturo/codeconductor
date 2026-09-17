import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  evaluateOddAdoption,
  type OddAdoptionSample,
} from '../../../src/core/evaluation/odd-adoption';

test('odd-adoption — published fixture meets the promotion gate', async () => {
  const fixture = await readFile(join(import.meta.dir, 'fixtures/non-inferior.json'), 'utf8');
  const result = evaluateOddAdoption(JSON.parse(fixture) as OddAdoptionSample[]);

  expect(result).toMatchObject({
    recommendation: 'eligible',
    contextReduced: true,
    cost: { status: 'reduced' },
  });
});
