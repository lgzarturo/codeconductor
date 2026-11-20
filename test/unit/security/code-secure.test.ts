import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { codeSecureCommand } from '../../../src/commands/code-secure.command';
import { WORKFLOW_PROFILES } from '../../../src/core/ccep/profiles';
import { scanDiff, scanSource } from '../../../src/core/security/dangerous-patterns';
import { validateWorkflowProfile } from '../../../src/validation/schemas';

const ROOT = resolve(import.meta.dir, '../../..');

const CASES: ReadonlyArray<{
  readonly id: string;
  readonly dangerous: string;
  readonly safe: string;
  readonly tool: string;
}> = [
  {
    id: 'command-injection',
    dangerous: 'Runtime.getRuntime().exec(cmd);',
    safe: 'commandRepository.findById(id);',
    tool: 'semgrep',
  },
  {
    id: 'code-injection',
    dangerous: 'eval(userCode);',
    safe: 'score.evaluate(answer);',
    tool: 'semgrep',
  },
  {
    id: 'dom-xss',
    dangerous: 'element.innerHTML = input;',
    safe: 'element.textContent = input;',
    tool: 'semgrep',
  },
  {
    id: 'sql-concat',
    dangerous: 'String sql = "SELECT * FROM users WHERE id = " + id;',
    safe: 'jdbc.query("SELECT * FROM users WHERE id = ?", id);',
    tool: 'semgrep',
  },
  {
    id: 'sql-template',
    dangerous: 'const sql = `SELECT * FROM users WHERE name = ${name}`;',
    safe: 'jdbc.query("SELECT * FROM users WHERE id = ?", id);',
    tool: 'semgrep',
  },
  {
    id: 'insecure-deserialization',
    dangerous: 'ObjectInputStream in = new ObjectInputStream(stream);',
    safe: 'objectMapper.readValue(json, User.class);',
    tool: 'semgrep',
  },
  {
    id: 'xml-xxe',
    dangerous: 'DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();',
    safe: 'factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);',
    tool: 'semgrep',
  },
  {
    id: 'spel-injection',
    dangerous: 'Expression expr = parser.parseExpression(input);',
    safe: 'context.setVariable("user", user);',
    tool: 'semgrep',
  },
  {
    id: 'csrf-disabled',
    dangerous: 'http.csrf().disable();',
    safe: 'http.csrf(csrf -> csrf.csrfTokenRepository(repo));',
    tool: 'semgrep',
  },
  {
    id: 'open-endpoints',
    dangerous: 'auth.anyRequest().permitAll();',
    safe: 'auth.anyRequest().authenticated();',
    tool: 'semgrep',
  },
  {
    id: 'cors-wildcard',
    dangerous: 'config.allowedOrigins("*");',
    safe: 'config.allowedOrigins("https://app.example.com");',
    tool: 'semgrep',
  },
  {
    id: 'weak-crypto',
    dangerous: 'MessageDigest.getInstance("MD5");',
    safe: 'MessageDigest.getInstance("SHA-256");',
    tool: 'semgrep',
  },
  {
    id: 'spring-plaintext-secret',
    dangerous: 'password: "s3cret-value"',
    safe: 'password: "${SECRET_DB}"',
    tool: 'betterleaks',
  },
  {
    id: 'client-exposed-secret',
    dangerous: 'NEXT_PUBLIC_API_SECRET=sk_live_example',
    safe: 'NEXT_PUBLIC_API_URL=https://api.example.com',
    tool: 'betterleaks',
  },
];

describe('dangerous pattern catalog', () => {
  for (const sample of CASES) {
    test(`${sample.id} warns on the dangerous line and skips the safe line`, () => {
      const dangerous = scanSource('App.java', sample.dangerous);
      const hit = dangerous.find((item) => item.id === sample.id);
      expect(hit?.advisory).toBe(true);
      expect(hit?.tool).toBe(sample.tool);
      expect(hit?.line).toBe(1);
      expect(scanSource('App.java', sample.safe).some((item) => item.id === sample.id)).toBe(false);
    });
  }

  test('a manifest diff is listed for dependency review', () => {
    const diff = [
      'diff --git a/package.json b/package.json',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -1,1 +1,2 @@',
      ' {',
      '+  "lodash": "4.17.21"',
    ].join('\n');
    const hits = scanDiff(diff);
    expect(hits.map((hit) => hit.id)).toEqual(['supply-chain']);
    expect(hits[0]?.file).toBe('package.json');
    expect(hits[0]?.advisory).toBe(true);
    expect(hits[0]?.tool).toBe('dependency-review');
  });

  test('an added line keeps the new-file line number', () => {
    const diff = [
      'diff --git a/src/App.java b/src/App.java',
      '--- a/src/App.java',
      '+++ b/src/App.java',
      '@@ -10,2 +10,3 @@',
      ' context',
      '+Runtime.getRuntime().exec(cmd);',
      ' context2',
    ].join('\n');
    const hit = scanDiff(diff).find((item) => item.id === 'command-injection');
    expect(hit?.file).toBe('src/App.java');
    expect(hit?.line).toBe(11);
  });
});

describe('code-secure scan', () => {
  test('exits 0 when advisory hits are present', async () => {
    const result = await codeSecureCommand({
      projectRoot: ROOT,
      diffText: 'Runtime.getRuntime().exec(cmd);\n',
      probe: () => false,
    });
    expect(result.code).toBe(0);
    expect(result.data.advisory).toBe(true);
    expect(result.data.findings.some((hit) => hit.id === 'command-injection')).toBe(true);
    expect(result.data.tools.every((tool) => tool.executed === false)).toBe(true);
  });

  test('runs Betterleaks when it is installed and does not run Semgrep or TruffleHog', async () => {
    const calls: string[] = [];
    const result = await codeSecureCommand({
      projectRoot: ROOT,
      diffText: 'eval(userCode);\n',
      probe: (name) => name === 'betterleaks' || name === 'gitleaks' || name === 'semgrep' || name === 'trufflehog',
      runSecretScan: (bin) => {
        calls.push(bin);
        return { executed: true, detail: 'redacted' };
      },
    });
    expect(result.code).toBe(0);
    expect(calls).toEqual(['betterleaks']);
    const byName = Object.fromEntries(result.data.tools.map((tool) => [tool.name, tool]));
    expect(byName.gitleaks?.executed).toBe(false);
    expect(byName.semgrep?.present).toBe(true);
    expect(byName.semgrep?.executed).toBe(false);
    expect(byName.trufflehog?.executed).toBe(false);
    expect(byName.semgrep?.detail).toContain('181 of 241');
    expect(byName.semgrep?.detail).toContain('elttam');
  });
});

describe('code-secure workflow', () => {
  test('profile stays read-only', () => {
    const profile = validateWorkflowProfile(WORKFLOW_PROFILES['code-secure']);
    expect(profile.command).toBe('code-secure');
    expect(profile.phases.map((phase) => phase.id)).toEqual(['patterns', 'diff-review', 'flow-tests']);
    expect(profile.phases.map((phase) => phase.agent)).toEqual([
      'repo-explorer',
      'security-reviewer',
      'tester',
    ]);
    expect(profile.confirmationGate.stopOnHighRisk).toBe(false);
    expect(JSON.stringify(profile)).not.toContain('implementer');
  });

  test('the cursor command scans with npx and does not name the local dev script', async () => {
    const content = await readFile(resolve(ROOT, 'presets/cursor/commands/cc/code-secure.md'), 'utf-8');
    expect(content).toContain('npx cc-codeconductor code-secure scan --json');
    expect(content).toContain('## Step 0 — CCEP Bootstrap');
    expect(content).not.toContain('bun run dev');
  });
});
