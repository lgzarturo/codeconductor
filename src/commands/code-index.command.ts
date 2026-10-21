import {
  buildCodeIndex,
  findSymbols,
  loadCodeIndex,
  measureCodeIndex,
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
      const buildStart = Date.now();
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
      const buildMs = Date.now() - buildStart;
      const files = Object.keys(built.data.files).length;
      const symbols = Object.values(built.data.files).reduce((n, list) => n + list.length, 0);
      const bytes = Buffer.byteLength(JSON.stringify(built.data, null, 2));
      if (output === 'json') {
        return {
          code: 0,
          data: { success: true, command: 'code-index build', files, symbols, bytes, buildMs, path: saved.data.path },
        };
      }
      return {
        code: 0,
        data: {
          success: true,
          command: 'code-index build',
          output: `Indexed ${symbols} symbols across ${files} files (${(bytes / 1024).toFixed(1)} KB, ${buildMs} ms) → .codeconductor/code-index.json`,
        },
      };
    }

    case 'stats': {
      const stats = await measureCodeIndex(projectRoot);
      if (!stats.success) {
        return {
          code: 1,
          data: { success: false, command: 'code-index stats', errors: [stats.error.message] },
        };
      }
      if (output === 'json') {
        return { code: 0, data: { success: true, command: 'code-index stats', ...stats.data } };
      }
      const lines = [
        `Index: ${(stats.data.bytes / 1024).toFixed(1)} KB · ${stats.data.symbols} symbols across ${stats.data.files} files`,
        `Load: ${stats.data.loadMs} ms · full-sweep find: ${stats.data.findMs} ms`,
        ...stats.data.topFiles.map((t) => `  ${t.symbols} ${t.file}`),
      ];
      return {
        code: 0,
        data: { success: true, command: 'code-index stats', output: lines.join('\n') },
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
          errors: ['Usage: code-index build|find|file|stats'],
        },
      };
  }
}
