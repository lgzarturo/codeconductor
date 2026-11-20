/**
 * Advisory signatures for `/cc:code-secure`.
 * A hit does not follow data flow and must not block a commit or a review.
 */

export interface PatternHit {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly advisory: true;
  readonly tool: string;
}

interface PatternRule {
  readonly id: string;
  readonly tool: string;
  readonly pattern: RegExp;
}

const RULES: readonly PatternRule[] = [
  {
    id: 'command-injection',
    tool: 'semgrep',
    pattern:
      /Runtime\.getRuntime\(\)\.exec\s*\(|new\s+ProcessBuilder\s*\(|\bos\.system\s*\(|\bshell\s*=\s*True\b|\b(?:shell_exec|passthru)\s*\(|child_process\.exec\s*\(|\bexec\s*\(\s*\$|\bsystem\s*\(\s*\$/,
  },
  {
    id: 'code-injection',
    tool: 'semgrep',
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(|\bScriptEngine\b|\bGroovyShell\b/,
  },
  {
    id: 'dom-xss',
    tool: 'semgrep',
    pattern: /\.innerHTML\b|\.outerHTML\b|\bdocument\.write\s*\(|dangerouslySetInnerHTML|\bv-html\s*=/,
  },
  {
    id: 'sql-concat',
    tool: 'semgrep',
    pattern:
      /['"]\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^'"\n]*['"]\s*\+|\+\s*['"]\s*(?:SELECT|INSERT|UPDATE|DELETE)\b|String\.format\(\s*['"][^'"\n]*(?:SELECT|INSERT|UPDATE|DELETE)\b/i,
  },
  {
    id: 'sql-template',
    tool: 'semgrep',
    pattern:
      /`[^`\n]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`\n]*\$\{|"""[^"\n]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^"\n]*\$\w|f['"][^'"\n]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^'"\n]*\{/i,
  },
  {
    id: 'insecure-deserialization',
    tool: 'semgrep',
    pattern:
      /new\s+ObjectInputStream\s*\(|\.readObject\s*\(|pickle\.loads\s*\(|\bunserialize\s*\(|enableDefaultTyping\s*\(|new\s+XStream\s*\(|\bYAML\.load\s*\(/,
  },
  {
    id: 'xml-xxe',
    tool: 'semgrep',
    pattern: /DocumentBuilderFactory\.newInstance\s*\(|new\s+XMLDecoder\s*\(|libxml_disable_entity_loader\s*\(\s*false\s*\)/,
  },
  {
    id: 'spel-injection',
    tool: 'semgrep',
    pattern: /\.parseExpression\s*\(|new\s+SpelExpressionParser\s*\(/,
  },
  {
    id: 'csrf-disabled',
    tool: 'semgrep',
    pattern: /csrf\(\)\.disable\s*\(|AbstractHttpConfigurer::disable|csrf\s*:\s*false\b/i,
  },
  {
    id: 'open-endpoints',
    tool: 'semgrep',
    pattern: /permitAll\s*\(\s*\)/,
  },
  {
    id: 'cors-wildcard',
    tool: 'semgrep',
    pattern:
      /allowedOrigins\(\s*["']\*["']\s*\)|addAllowedOrigin\(\s*["']\*["']\s*\)|Access-Control-Allow-Origin["']?\s*[:=]\s*["']?\*/i,
  },
  {
    id: 'weak-crypto',
    tool: 'semgrep',
    pattern:
      /getInstance\(\s*["'](?:MD5|SHA-1|SHA1|DES)["']\s*\)|NoopHostnameVerifier|TrustAllCerts|ALLOW_ALL_HOSTNAME_VERIFIER/,
  },
  {
    id: 'spring-plaintext-secret',
    tool: 'betterleaks',
    pattern: /(?:password|secret|api-key|apiKey|token)\s*[:=]\s*["'](?!\$\{)[^"'\n]{8,}["']/i,
  },
  {
    id: 'client-exposed-secret',
    tool: 'betterleaks',
    pattern:
      /(?:NEXT_PUBLIC|VITE|REACT_APP)_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY)[A-Z0-9_]*\s*=\s*["']?[A-Za-z0-9_\-+/=]{8,}/,
  },
];

const MANIFEST =
  /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pom\.xml|build\.gradle(?:\.kts)?|composer\.(?:json|lock)|requirements(?:-[^/]+)?\.txt|poetry\.lock|go\.(?:mod|sum)|Cargo\.(?:toml|lock)|Gemfile(?:\.lock)?)$/;

function lineHits(file: string, lineNumber: number, line: string): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const rule of RULES) {
    if (!rule.pattern.test(line)) continue;
    hits.push({
      id: rule.id,
      file,
      line: lineNumber,
      advisory: true,
      tool: rule.tool,
    });
  }
  return hits;
}

function manifestHit(file: string): PatternHit | undefined {
  if (!MANIFEST.test(file)) return undefined;
  return {
    id: 'supply-chain',
    file,
    line: 1,
    advisory: true,
    tool: 'dependency-review',
  };
}

/** Scan a source file. Manifest paths add one supply-chain hit. */
export function scanSource(file: string, content: string): PatternHit[] {
  const hits: PatternHit[] = [];
  const manifest = manifestHit(file);
  if (manifest) hits.push(manifest);
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index++) {
    hits.push(...lineHits(file, index + 1, lines[index] ?? ''));
  }
  return hits;
}

function addedPath(header: string): string | undefined {
  const path = header.startsWith('+++ ') ? header.slice(4).trim() : header.trim();
  if (path === '/dev/null') return undefined;
  return path.replace(/^b\//, '').replace(/^"|"$/g, '');
}

/**
 * Scan a unified diff. Only added lines are checked.
 * Text that is not a diff is scanned as `<stdin>`.
 */
export function scanDiff(diff: string): PatternHit[] {
  if (diff.trim() === '') return [];
  const looksLikeDiff = diff.includes('diff --git ') || diff.startsWith('@@') || diff.includes('\n@@');
  if (!looksLikeDiff) return scanSource('<stdin>', diff);

  const hits: PatternHit[] = [];
  const manifests = new Set<string>();
  let file = '';
  let newLine = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const match = raw.match(/ b\/(.+)$/);
      file = match?.[1]?.replace(/"$/, '') ?? '';
      newLine = 0;
      if (file && MANIFEST.test(file)) manifests.add(file);
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const next = addedPath(raw);
      if (next) {
        file = next;
        if (MANIFEST.test(file)) manifests.add(file);
      }
      continue;
    }
    if (raw.startsWith('@@')) {
      const match = raw.match(/\+(\d+)/);
      newLine = match ? Number(match[1]) : 0;
      continue;
    }
    if (raw.startsWith('\\')) continue;
    if (raw.startsWith('+')) {
      if (file && newLine > 0) hits.push(...lineHits(file, newLine, raw.slice(1)));
      if (newLine > 0) newLine++;
      continue;
    }
    if (raw.startsWith('-')) continue;
    if (newLine > 0) newLine++;
  }

  for (const manifest of manifests) {
    hits.push({
      id: 'supply-chain',
      file: manifest,
      line: 1,
      advisory: true,
      tool: 'dependency-review',
    });
  }
  return hits;
}
