import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { ValidationError } from '../../cli/errors';
import type { CouncilSpec } from '../../domain/council/council-spec';
import { err, ok, type Result } from '../../utils/result';
import { validateCouncilSpec } from '../../validation/schemas';
import { SRC_PRESETS_DIR } from './package-paths';

/**
 * Load and validate a preset.
 * Searches in order:
 *   1. .codeconductor/presets/<name>.yml  (user-customizable)
 *   2. src/presets/<name>/<name>.yml      (bundled, dev fallback)
 */
export async function loadPreset(
  name: string,
  projectRoot = process.cwd()
): Promise<Result<CouncilSpec, ValidationError>> {
  const candidates = [
    resolve(projectRoot, '.codeconductor', 'presets', `${name}.yml`),
    resolve(SRC_PRESETS_DIR, name, `${name}.yml`),
  ];

  for (const presetPath of candidates) {
    try {
      const content = await readFile(presetPath, 'utf-8');
      const data = parse(content);

      if (!data) continue;

      const validated = validateCouncilSpec(data);
      return ok(validated);
    } catch (error) {
      if (error instanceof ValidationError) {
        return err(error);
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // Malformed YAML or schema error — fail immediately, don't silently try next candidate
        return err(new ValidationError(`Invalid preset at ${presetPath}: ${String(error)}`));
      }
      // ENOENT — file not found, try next candidate
    }
  }

  return err(new ValidationError(`Preset not found: ${name}. Run \`codeconductor init\` first.`));
}

/**
 * Load council preset (convenience function)
 */
export async function loadCouncilPreset(
  projectRoot?: string
): Promise<Result<CouncilSpec, ValidationError>> {
  return loadPreset('council', projectRoot);
}
