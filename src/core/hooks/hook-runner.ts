/**
 * OS-agnostic agent hook policy. No bash, no jq, no GNU date.
 * Hosts call `cc-codeconductor hook <event>` via Node.
 */

export type AgentRole = 'tester' | 'implementer' | 'reviewer' | 'architect';

export interface RoleAccessResult {
  allowed: boolean;
  reason?: string;
}

const DEFAULT_PROTECTED_PATTERNS = [
  'tests/', 'test/', 'specs/', 'contracts/',
  '.test.', '.spec.', '_test.', '_spec.',
];

export function evaluateRoleAccess(
  role: AgentRole,
  filePath: string,
  protectedDirs?: string[],
): RoleAccessResult {
  const patterns = protectedDirs ?? DEFAULT_PROTECTED_PATTERNS;
  
  switch (role) {
    case 'implementer':
      // Implementer cannot write to test/spec directories
      if (patterns.some(p => filePath.includes(p))) {
        return { allowed: false, reason: `SecurityViolation: File '${filePath}' is READ-ONLY for the Implementer role.` };
      }
      return { allowed: true };
    
    case 'tester':
      // Tester can only write to test directories
      if (!patterns.some(p => filePath.includes(p))) {
        return { allowed: false, reason: `SecurityViolation: Tester role can only modify test files. '${filePath}' is outside test scope.` };
      }
      return { allowed: true };
    
    case 'reviewer':
    case 'architect':
      // Reviewer and architect cannot write any source files
      // (architect can write docs/md — check for .md extension)
      if (role === 'architect' && (filePath.endsWith('.md') || filePath.includes('docs/'))) {
        return { allowed: true };
      }
      return { allowed: false, reason: `SecurityViolation: ${role} role has no write access to '${filePath}'.` };
    
    default:
      return { allowed: true };
  }
}

export type HookEvent = 'pre-tool' | 'post-tool' | 'session-start';
export type HookFormat = 'claude' | 'agy';
export type HookAction = 'allow' | 'ask' | 'deny';

export interface HookVerdict {
  readonly action: HookAction;
  readonly message: string;
  readonly exitCode: number;
}

export interface PreToolInput {
  readonly command?: string;
  readonly filePath?: string;
  readonly toolName?: string;
}

const SENSITIVE_PATH =
  /(?:\.env\b|secrets[/\\]|id_rsa|\.pem\b|\.key\b|(?:^|[/\\])\.ssh(?:[/\\]|$)|(?:^|[/\\])\.aws(?:[/\\]|$)|(?:^|[/\\])\.kube(?:[/\\]|$))/i;
const READ_LIKE = /(?:^|[\s;&|])(cat|less|more|head|tail|type|Get-Content|cp|copy|mv|move|scp)\b/i;

const MSG_SECRET = 'Bloqueado: intento de leer archivos sensibles';
const MSG_AUTHORITY = 'Bloqueado: El agente no tiene autoridad sobre este comando.';
const MSG_POLICY = 'Bloqueado: Command violated security policy';

export function normalizeCommand(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Treat `git.exe` / `C:\...\git.exe` as `git` for policy matching. */
export function stripGitBinary(command: string): string {
  return command.replace(/(?:^|[\\/])git(?:\.exe)?\b/i, 'git');
}

export function evaluatePath(filePath: string): HookVerdict {
  if (SENSITIVE_PATH.test(filePath.replace(/\//g, '\\')) || SENSITIVE_PATH.test(filePath)) {
    return deny(MSG_SECRET);
  }
  return allow();
}

export function evaluateCommand(rawCommand: string): HookVerdict {
  const command = stripGitBinary(normalizeCommand(rawCommand));
  if (!command) return allow();

  if (SENSITIVE_PATH.test(command) && READ_LIKE.test(command)) {
    return deny(MSG_SECRET);
  }

  if (isGitPush(command)) return deny(MSG_AUTHORITY);
  if (/^git\s+reset\s+--hard\b/i.test(command)) return deny(MSG_AUTHORITY);
  if (isForcedClean(command)) return deny(MSG_AUTHORITY);
  if (isForcedBranchDelete(command)) return deny(MSG_AUTHORITY);
  if (isDestructiveCheckout(command)) return deny(MSG_AUTHORITY);
  if (isDestructiveRestore(command)) return deny(MSG_AUTHORITY);
  if (/^git\s+rebase\b/i.test(command)) return deny(MSG_POLICY);
  if (/^git\s+push\b/i.test(command) && /(?:\s--force\b|\s-f\b)/.test(command)) {
    return deny(MSG_AUTHORITY);
  }

  if (/^rm\s+-rf\s+(\*|[\\/])/i.test(command)) return deny(MSG_POLICY);
  if (/^sudo\s+/i.test(command)) return deny(MSG_POLICY);
  if (/(?:curl|wget)\b.+\|\s*(sh|bash|zsh|cmd)\b/i.test(command)) return deny(MSG_POLICY);
  if (/^chmod\s+777\b/i.test(command)) return deny(MSG_POLICY);
  if (/^dd\s+/i.test(command)) return deny(MSG_POLICY);
  if (/^mkfs\b/i.test(command)) return deny(MSG_POLICY);

  if (
    /^git\s+commit\b/i.test(command) ||
    /^git\s+switch\b/i.test(command) ||
    /^docker\s+compose\b/i.test(command)
  ) {
    return ask();
  }

  return allow();
}

export function evaluatePreTool(input: PreToolInput): HookVerdict {
  if (input.filePath) {
    const pathVerdict = evaluatePath(input.filePath);
    if (pathVerdict.action === 'deny') return pathVerdict;
  }
  if (input.command) {
    return evaluateCommand(input.command);
  }
  return allow();
}

export function formatHookOutput(verdict: HookVerdict, format: HookFormat): string {
  if (format === 'agy') {
    if (verdict.action === 'deny') {
      return JSON.stringify({ action: 'deny', error: verdict.message });
    }
    if (verdict.action === 'ask') {
      return JSON.stringify({ action: 'ask' });
    }
    return JSON.stringify({ action: 'allow' });
  }
  return '';
}

export function claudeExitCode(verdict: HookVerdict): number {
  return verdict.action === 'deny' ? 2 : 0;
}

export function parseAgyPayload(raw: string): PreToolInput {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as {
      toolName?: string;
      arguments?: {
        CommandLine?: string;
        TargetFile?: string;
        AbsolutePath?: string;
      };
    };
    const args = parsed.arguments ?? {};
    return {
      toolName: parsed.toolName,
      command: args.CommandLine,
      filePath: args.TargetFile ?? args.AbsolutePath,
    };
  } catch {
    return {};
  }
}

export function formatSessionStart(lines: readonly string[]): string {
  return lines.filter(Boolean).join('\n');
}

function allow(): HookVerdict {
  return { action: 'allow', message: '', exitCode: 0 };
}

function ask(): HookVerdict {
  return { action: 'ask', message: '', exitCode: 0 };
}

function deny(message: string): HookVerdict {
  return { action: 'deny', message, exitCode: 2 };
}

function isGitPush(command: string): boolean {
  return /^git\s+push\b/i.test(command);
}

function isForcedClean(command: string): boolean {
  if (!/^git\s+clean\b/i.test(command)) return false;
  if (/\s--force\b/.test(command)) return true;
  const flagMatch = command.match(/\s-([a-zA-Z]+)/g);
  return (flagMatch ?? []).some((part) => part.includes('f') || part.includes('F'));
}

function isForcedBranchDelete(command: string): boolean {
  if (!/^git\s+branch\b/i.test(command)) return false;
  if (/\s-D\b/.test(command)) return true;
  return /\s--delete\b/.test(command) && /\s--force\b/.test(command);
}

function isDestructiveCheckout(command: string): boolean {
  if (!/^git\s+checkout\b/i.test(command)) return false;
  if (/\s(?:-f|--force|--discard-changes|--theirs|--ours)\b/.test(command)) return true;
  // `git checkout -` (previous branch) — existing guardrail treats as ambiguous discard
  return /^git\s+checkout\s+-\s*$/i.test(command);
}

function isDestructiveRestore(command: string): boolean {
  if (!/^git\s+restore\b/i.test(command)) return false;
  return /\s(?:-f|--force|--discard-changes|--theirs|--ours)\b/.test(command);
}
