import { spawnSync } from 'node:child_process';
import { scanDiff } from '../core/security/dangerous-patterns';
import type { OutputMode } from '../utils/logger';

export type SecretTool = 'betterleaks' | 'gitleaks';
export type ToolName = SecretTool | 'semgrep' | 'trufflehog';

export interface ToolStatus {
  readonly name: ToolName;
  readonly present: boolean;
  readonly executed: boolean;
  readonly detail: string;
}

export interface CodeSecureReport {
  readonly success: true;
  readonly advisory: true;
  readonly output: string;
  readonly findings: ReturnType<typeof scanDiff>;
  readonly tools: readonly ToolStatus[];
  readonly diffError?: string;
}

export interface CodeSecureOptions {
  readonly projectRoot: string;
  readonly output?: OutputMode;
  readonly diffText?: string;
  readonly paths?: readonly string[];
  readonly probe?: (name: ToolName) => boolean;
  readonly runSecretScan?: (bin: SecretTool, diff: string) => { readonly executed: boolean; readonly detail: string };
}

const SEMGREP_DETAIL =
  'This scan does not download rules. When semgrep is installed, run the community packs p/java, p/kotlin, p/php, p/django, p/nextjs, p/owasp-top-ten, and p/spring. 181 of 241 p/java rules and 63 of 73 p/kotlin rules are Pro and need login. elttam community rules add Spring, Jackson, and XStream. A community-only run is not full coverage.';

const TRUFFLEHOG_DETAIL =
  'Use in CI with --only-verified, plus a weekly history sweep. This command does not call issuer APIs.';

const ABSENT_SECRET =
  'Not installed. A pre-commit hook should run Betterleaks, or Gitleaks if Betterleaks is absent. This scan does not install either tool and does not block the commit.';

function defaultProbe(name: ToolName): boolean {
  const result = spawnSync(name, ['--version'], { stdio: 'ignore', timeout: 5000 });
  return result.status === 0;
}

function defaultSecretScan(bin: SecretTool, diff: string): { readonly executed: boolean; readonly detail: string } {
  const result = spawnSync(bin, ['detect', '--pipe', '--redact', '--exit-code', '0'], {
    input: diff,
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error) {
    return { executed: false, detail: `not run: ${result.error.message}` };
  }
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const clipped = text.length > 500 ? `${text.slice(0, 500)}…` : text;
  return { executed: true, detail: clipped || 'offline scan finished with no output' };
}

function gitDiff(projectRoot: string, paths: readonly string[]): { readonly text: string; readonly error?: string } {
  const args = paths.length > 0 ? ['diff', 'HEAD', '--', ...paths] : ['diff', 'HEAD'];
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error || result.status !== 0) {
    const error = (result.stderr || result.error?.message || 'git diff failed').trim();
    return { text: '', error };
  }
  return { text: result.stdout ?? '' };
}

async function readPipedStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function secretStatus(
  name: SecretTool,
  present: boolean,
  selected: SecretTool | undefined,
  diff: string,
  run: (bin: SecretTool, diff: string) => { readonly executed: boolean; readonly detail: string },
): ToolStatus {
  if (!present) return { name, present: false, executed: false, detail: ABSENT_SECRET };
  if (selected !== name) {
    return {
      name,
      present: true,
      executed: false,
      detail: 'Installed. Betterleaks is preferred for the offline diff scan, so this binary was not run.',
    };
  }
  if (diff.trim() === '') {
    return { name, present: true, executed: false, detail: 'Installed. The diff is empty, so the offline scan was skipped.' };
  }
  const ran = run(name, diff);
  return { name, present: true, executed: ran.executed, detail: ran.detail };
}

/**
 * Scan a diff for advisory patterns. The process exit code is always 0:
 * regex hits and missing external tools do not block.
 */
export async function codeSecureCommand(options: CodeSecureOptions): Promise<{ code: 0; data: CodeSecureReport }> {
  const probe = options.probe ?? defaultProbe;
  const runSecretScan = options.runSecretScan ?? defaultSecretScan;
  let diff = options.diffText;
  let diffError: string | undefined;
  if (diff === undefined) {
    const piped = await readPipedStdin();
    if (piped !== undefined) {
      diff = piped;
    } else {
      const fromGit = gitDiff(options.projectRoot, options.paths ?? []);
      diff = fromGit.text;
      diffError = fromGit.error;
    }
  }

  const findings = scanDiff(diff);
  const betterleaksPresent = probe('betterleaks');
  const gitleaksPresent = probe('gitleaks');
  const selected: SecretTool | undefined = betterleaksPresent
    ? 'betterleaks'
    : gitleaksPresent
      ? 'gitleaks'
      : undefined;

  const tools: ToolStatus[] = [
    secretStatus('betterleaks', betterleaksPresent, selected, diff, runSecretScan),
    secretStatus('gitleaks', gitleaksPresent, selected, diff, runSecretScan),
    {
      name: 'semgrep',
      present: probe('semgrep'),
      executed: false,
      detail: SEMGREP_DETAIL,
    },
    {
      name: 'trufflehog',
      present: probe('trufflehog'),
      executed: false,
      detail: TRUFFLEHOG_DETAIL,
    },
  ];

  const summary = findings.length === 0
    ? 'Code secure scan: no advisory pattern hits.'
    : `Code secure scan: ${findings.length} advisory pattern hit(s). These do not block.`;

  const data: CodeSecureReport = {
    success: true,
    advisory: true,
    output: diffError ? `${summary} Diff was not read: ${diffError}` : summary,
    findings,
    tools,
    ...(diffError ? { diffError } : {}),
  };
  return { code: 0, data };
}
