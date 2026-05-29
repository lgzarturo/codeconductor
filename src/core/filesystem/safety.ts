import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

/**
 * Protected paths that should not be modified
 */
const PROTECTED_PATHS = ['.git', '.env', '.env.local', '.env.production', 'secrets', 'credentials'];

/**
 * Check if a file exists
 */
export async function fileExists(dir: string, filename: string): Promise<boolean> {
  try {
    const path = filename.startsWith('/') ? filename : `${dir}/${filename}`;
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is protected
 */
export function isProtectedPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return PROTECTED_PATHS.some((p) => normalized.includes(p.toLowerCase()));
}

/**
 * Validate safe write path
 */
export function validateWritePath(path: string): boolean {
  return !isProtectedPath(path);
}

/**
 * Check if directory is writable
 */
export async function isWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
