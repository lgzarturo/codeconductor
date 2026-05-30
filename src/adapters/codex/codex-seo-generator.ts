import type { GeneratedFile } from '../../core/generation/generated-file';

export function generateCodexSeoFiles(): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: '.codex/commands/cc-seo-audit.md',
    content: generateSeoAuditCommand(),
    overwrite: true,
  });

  files.push({
    path: '.codex/commands/cc-seo-llms.md',
    content: generateSeoLlmsCommand(),
    overwrite: true,
  });

  return files;
}

function generateSeoAuditCommand(): string {
  return `Run a comprehensive SEO audit using CodeConductor.

## Usage
\`\`\`
/cc-seo-audit --url <url> [--format json|markdown] [--fail-on error|warning]
/cc-seo-audit --sitemap <sitemap-url> [--format json|markdown] [--fail-on error|warning]
\`\`\`

## Instructions
1. Execute: \`codeconductor seo audit $ARGUMENTS\`
2. Read the generated report
3. Summarize findings by severity
4. Suggest remediation actions

Hard rules: sitemap-scoped only, GET only, no auth, SSRF prevention.
`;
}

function generateSeoLlmsCommand(): string {
  return `Generate llms.txt for AI-search readiness using CodeConductor.

## Usage
\`\`\`
/cc-seo-llms --sitemap <sitemap-url> [--output <path>]
/cc-seo-llms --url <url> [--output <path>]
\`\`\`

## Instructions
1. Execute: \`codeconductor seo llms $ARGUMENTS\`
2. Read the generated llms.txt
3. Present the content
4. Suggest placing at site root

Hard rules: sitemap-scoped only, GET only, no auth, SSRF prevention.
`;
}
