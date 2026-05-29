import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { ValidationError } from '../../cli/errors';
import { err, ok, type Result } from '../../utils/result';
import { validateConfig } from '../../validation/schemas';
import type { CodeConductorConfig } from './codeconductor-config';

const CONFIG_FILE = '.codeconductor/config.yml';

/**
 * Load configuration from project root
 */
export async function loadConfig(
  projectRoot: string
): Promise<Result<CodeConductorConfig, ValidationError>> {
  try {
    const configPath = resolve(projectRoot, CONFIG_FILE);
    const content = await readFile(configPath, 'utf-8');
    const data = parse(content);

    if (!data) {
      return err(new ValidationError('Empty config file'));
    }

    const validated = validateConfig(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      return err(error);
    }
    // Config doesn't exist is not an error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return err(new ValidationError('Config file not found. Run `codeconductor init` first.'));
    }
    return err(new ValidationError('Failed to load config', error));
  }
}

/**
 * Check if config exists
 */
export async function configExists(projectRoot: string): Promise<boolean> {
  try {
    const configPath = resolve(projectRoot, CONFIG_FILE);
    await readFile(configPath, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
