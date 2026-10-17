import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/** Relative hook script path written into project-local Claude settings. */
export const CLAUDE_HOOK_SCRIPT_RELATIVE = '.claude/hooks/invoke-hook.cjs';

const RELATIVE_CLAUDE_HOOK_RE =
  /^(?<runner>node|bun)\s+(?<quote>["']?)(?:\.\/)?\.claude\/hooks\/invoke-hook\.cjs\k<quote>(?<rest>.*)$/i;

const CLAUDE_HOOK_SCRIPT_RE =
  /^(?<runner>node|bun)\s+(?<quote>["']?)(?<script>.+?[/\\]hooks[/\\]invoke-hook\.cjs|\.claude[/\\]hooks[/\\]invoke-hook\.cjs)\k<quote>(?<rest>.*)$/i;

export interface HookCommandChange {
  readonly from: string;
  readonly to: string;
}

export interface HookPathIssue {
  readonly command: string;
  readonly reason: 'relative' | 'missing';
}

/**
 * Normalize an absolute hook script path for embedding in a Claude `command`
 * string. Forward slashes work with Node on Windows and avoid the quote/escape
 * mess of backslashes inside shell-style command lines.
 */
export function normalizeHookScriptPath(absoluteScriptPath: string): string {
  return absoluteScriptPath.replace(/\\/g, '/');
}

/**
 * Quote a path for use inside a Claude hook `command` string.
 * Quotes only when whitespace or shell-sensitive characters remain after
 * normalizing separators to `/`.
 */
export function quoteHookPath(path: string): string {
  const normalized = normalizeHookScriptPath(path);
  if (/[\s"$`]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '\\"')}"`;
  }
  return normalized;
}

/** Build `node <absolute-script> <args…>` for a global Claude hook entry. */
export function buildAbsoluteClaudeHookCommand(absoluteScriptPath: string, rest = ''): string {
  const suffix = rest.trim().length > 0 ? ` ${rest.trim()}` : '';
  return `node ${quoteHookPath(absoluteScriptPath)}${suffix}`;
}

export function isRelativeClaudeHookCommand(command: string): boolean {
  return RELATIVE_CLAUDE_HOOK_RE.test(command.trim());
}

export function parseClaudeHookCommand(
  command: string
): { runner: string; script: string; rest: string } | null {
  const match = command.trim().match(CLAUDE_HOOK_SCRIPT_RE);
  if (!match?.groups) return null;
  return {
    runner: match.groups.runner,
    script: match.groups.script,
    rest: (match.groups.rest ?? '').trim(),
  };
}

function mapHookCommands(
  value: unknown,
  rewrite: (command: string) => string | null
): { value: unknown; changes: HookCommandChange[] } {
  const changes: HookCommandChange[] = [];

  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(visit);
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(obj)) {
        if (key === 'command' && typeof child === 'string') {
          const rewritten = rewrite(child);
          if (rewritten !== null && rewritten !== child) {
            changes.push({ from: child, to: rewritten });
            next[key] = rewritten;
            continue;
          }
        }
        next[key] = visit(child);
      }
      return next;
    }
    return node;
  };

  return { value: visit(value), changes };
}

/**
 * Rewrite relative Claude CodeConductor hook commands to an absolute script
 * path under `globalBaseDir` (typically the user home for `--global` installs).
 * Leaves non-matching commands untouched. Safe to run repeatedly.
 */
export function rewriteClaudeHookCommandsForGlobal(
  settings: Record<string, unknown>,
  globalBaseDir: string
): { settings: Record<string, unknown>; changes: readonly HookCommandChange[] } {
  const absoluteScript = resolve(globalBaseDir, CLAUDE_HOOK_SCRIPT_RELATIVE);
  const hooks = settings.hooks;
  if (hooks === undefined) {
    return { settings, changes: [] };
  }

  const { value, changes } = mapHookCommands(hooks, (command) => {
    const trimmed = command.trim();
    const relativeMatch = trimmed.match(RELATIVE_CLAUDE_HOOK_RE);
    if (relativeMatch?.groups) {
      return buildAbsoluteClaudeHookCommand(absoluteScript, relativeMatch.groups.rest ?? '');
    }
    return null;
  });

  return {
    settings: { ...settings, hooks: value },
    changes,
  };
}

/**
 * Inspect Claude settings for CodeConductor hook commands that are still
 * project-relative or point at a missing script file.
 */
export function inspectClaudeHookCommandPaths(
  settings: Record<string, unknown>,
  options: { requireAbsolute?: boolean } = {}
): HookPathIssue[] {
  const issues: HookPathIssue[] = [];
  const hooks = settings.hooks;
  if (hooks === undefined) return issues;

  mapHookCommands(hooks, (command) => {
    const parsed = parseClaudeHookCommand(command);
    if (!parsed) return null;

    if (options.requireAbsolute !== false && isRelativeClaudeHookCommand(command)) {
      issues.push({ command, reason: 'relative' });
      return null;
    }

    const scriptPath = parsed.script;
    if (isAbsolute(scriptPath) && !existsSync(scriptPath)) {
      issues.push({ command, reason: 'missing' });
    }
    return null;
  });

  return issues;
}
