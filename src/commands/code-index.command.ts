import {
  buildCodeIndex,
  findSymbols,
  loadCodeIndex,
  saveCodeIndex,
  symbolsInFile,
} from '../core/code-index/code-index';
import type { OutputMode } from '../utils/logger';

export interface CodeIndexOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly output: OutputMode;
  readonly target?: string;
}

export async function codeIndexCommand(
  options: CodeIndexOptions,
): Promise<{ code: number; data?: unknown }> {
  const { subcommand, projectRoot, output, target } = options;

  switch (subcommand) {
    case 'build': {
      const built = await buildCodeIndex(projectRoot);
      if (!built.success) {
        return {
          code: 1,
          data: { success: false, command: 'code-index build', errors: [built.error.message] },
        };
      }
      const saved = await saveCodeIndex(projectRoot, built.data);
      if (!saved.success) {
        return {
          code: 1,
          data: { success: false, command: 'code-index build', errors: [saved.error.message] },
        };
      }
      const files = Object.keys(built.data.files).length;
      const symbols = Object.values(built.data.files).reduce((n, list) => n + list.length, 0);
      if (output === 'json') {
        return {
          code: 0,
          data: { success: true, command: 'code-index build', files, symbols, path: saved.data.path },
        };
      }
      return {
        code: 0,
        data: {
          success: true,
          command: 'code-index build',
          output: `Indexed ${symbols} symbols across ${files} files → .codeconductor/code-index.json`,
        },
      };
    }

    case 'find': {
      if (!target) {
        return {
          code: 1,
          data: { success: false, command: 'code-index', errors: ['Usage: code-index find <name>'] },
        };
      }
      const loaded = await loadCodeIndex(projectRoot);
      if (!loaded.success) {
        return {
          code: 1,
          data: { success: false, command: 'code-index find', errors: [loaded.error.message] },
        };
      }
      const matches = findSymbols(loaded.data, target);
      if (output === 'json') {
        return { code: 0, data: { success: true, command: 'code-index find', matches } };
      }
      const text =
        matches.length === 0
          ? `No matches for '${target}'.`
          : matches.map((m) => `${m.file}:${m.startLine}-${m.endLine} ${m.name} (${m.kind})`).join('\n');
      return { code: 0, data: { success: true, command: 'code-index find', output: text } };
    }

    case 'file': {
      if (!target) {
        return {
          code: 1,
          data: { success: false, command: 'code-index', errors: ['Usage: code-index file <path>'] },
        };
      }
      const loaded = await loadCodeIndex(projectRoot);
      if (!loaded.success) {
        return {
          code: 1,
          data: { success: false, command: 'code-index file', errors: [loaded.error.message] },
        };
      }
      const symbols = symbolsInFile(loaded.data, target);
      if (output === 'json') {
        return { code: 0, data: { success: true, command: 'code-index file', symbols } };
      }
      const text =
        symbols.length === 0
          ? `No symbols in '${target}' (not indexed).`
          : symbols.map((s) => `${s.startLine}-${s.endLine} ${s.name} (${s.kind})`).join('\n');
      return { code: 0, data: { success: true, command: 'code-index file', output: text } };
    }

    default:
      return {
        code: 1,
        data: {
          success: false,
          command: 'code-index',
          errors: ['Usage: code-index build|find|file'],
        },
      };
  }
}
