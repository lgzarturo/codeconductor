import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const ROOT = resolve(import.meta.dir, '..');
const PRESETS = ['claude', 'cursor', 'opencode', 'agy', 'codex'] as const;

describe('BC-010: GATE.md is shipped on every runner preset', () => {
  for (const preset of PRESETS) {
    test(`${preset} includes the bun typecheck/test installer fence`, async () => {
      const path = join(ROOT, 'presets', preset, 'gates', 'pre-commit', 'GATE.md');
      expect(existsSync(path)).toBe(true);
      const body = await readFile(path, 'utf-8');
      expect(body).toContain('```bash');
      expect(body).toContain('bun run typecheck');
      expect(body).toContain('bun run test');
      expect(body).not.toContain('npm install');
      expect(body).not.toContain('husky install');
    });
  }
});
