import type { GeneratedFile } from '../../core/generation/generated-file';

export function generateClaudeSeoFiles(): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: '.claude/commands/cc-seo-audit.md',
    content: generateSeoAuditCommand(),
    overwrite: true,
  });

  files.push({
    path: '.claude/commands/cc-seo-llms.md',
    content: generateSeoLlmsCommand(),
    overwrite: true,
  });

  return files;
}

function generateSeoAuditCommand(): string {
  return `Run a comprehensive SEO audit using CodeConductor.

Execute the following command and present the results:

\`\`\`bash
codeconductor seo audit $ARGUMENTS
\`\`\`

After the audit completes:
1. Read the generated report file
2. Summarize the key findings (errors, warnings, score)
3. Prioritize remediation actions by severity
4. Offer to fix issues if the project source code is available

Hard rules: sitemap-scoped only, GET only, no auth, SSRF prevention.
`;
}

function generateSeoLlmsCommand(): string {
  return `Generate a llms.txt file for AI-search readiness using CodeConductor.

Execute the following command:

\`\`\`bash
codeconductor seo llms $ARGUMENTS
\`\`\`

After generation:
1. Read the generated llms.txt file
2. Present the content to the user
3. Suggest placing it at the site root
4. Offer to create llms-full.txt with extended content

Hard rules: sitemap-scoped only, GET only, no auth, SSRF prevention.
`;
}
