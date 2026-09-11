export type CommandSurface = 'colon' | 'hyphen' | 'dollar';

/**
 * Agent-native spelling for a CodeConductor workflow command.
 * Cursor/Claude/Gemini: /cc:name — OpenCode/AGY: /cc-name — Codex: $cc-name
 */
export function formatCcCommand(name: string, surface: CommandSurface): string {
  if (surface === 'colon') return `/cc:${name}`;
  if (surface === 'dollar') return `$cc-${name}`;
  return `/cc-${name}`;
}

export function surfaceForRunner(
  runner: 'cursor' | 'claude' | 'gemini' | 'opencode' | 'agy' | 'codex' | 'pi',
): CommandSurface {
  if (runner === 'codex') return 'dollar';
  if (runner === 'opencode' || runner === 'agy' || runner === 'pi') return 'hyphen';
  return 'colon';
}
