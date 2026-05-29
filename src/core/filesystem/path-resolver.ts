import { join, relative, resolve } from 'node:path';

/**
 * Resolve paths relative to project root
 */
export class PathResolver {
  private root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /**
   * Get project root
   */
  getRoot(): string {
    return this.root;
  }

  /**
   * Resolve a path relative to project root
   */
  resolve(...paths: string[]): string {
    return resolve(this.root, ...paths);
  }

  /**
   * Join paths
   */
  join(...paths: string[]): string {
    return join(this.root, ...paths);
  }

  /**
   * Get relative path from root
   */
  relative(to: string): string {
    return relative(this.root, to);
  }

  /**
   * Check if path is within project root
   */
  isWithinRoot(path: string): boolean {
    const resolved = resolve(path);
    return resolved.startsWith(this.root);
  }
}

/**
 * Create a path resolver for the project
 */
export function createPathResolver(root: string): PathResolver {
  return new PathResolver(root);
}
