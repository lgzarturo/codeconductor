import type { GeneratedFile } from '../../core/generation/generated-file';

export function generateOpenCodeSeoFiles(): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: '.opencode/commands/cc-seo-audit.md',
    content: generateSeoAuditCommand(),
    overwrite: true,
  });

  files.push({
    path: '.opencode/commands/cc-seo-llms.md',
    content: generateSeoLlmsCommand(),
    overwrite: true,
  });

  return files;
}

function generateSeoAuditCommand(): string {
  return `---
description: "Run a comprehensive SEO audit on a website using sitemap.xml"
---

# SEO Audit

Run a comprehensive SEO and GEO audit on hotel and hospitality websites.

## Usage

\`\`\`
/cc-seo-audit --url <url> [--format json|markdown] [--fail-on error|warning]
/cc-seo-audit --sitemap <sitemap-url> [--format json|markdown] [--fail-on error|warning]
\`\`\`

## Instructions

1. Parse the user's arguments (--url or --sitemap, --format, --fail-on, --delay, --output)
2. Run the CLI command:
   \`\`\`bash
   codeconductor seo audit --url <url> --format <format> --fail-on <level> --output <path>
   \`\`\`
   or for sitemap:
   \`\`\`bash
   codeconductor seo audit --sitemap <sitemap-url> --format <format> --fail-on <level> --output <path>
   \`\`\`
3. Read the generated report file
4. Present the findings to the user with remediation guidance
5. Return the appropriate exit code (0=pass, 1=errors, 2=warnings, 3=network error)

## Hard Rules

- Sitemap-scoped only. Only audit URLs from the sitemap.
- No external crawling.
- GET only. No auth headers.
- SSRF prevention enabled.
`;
}

function generateSeoLlmsCommand(): string {
  return `---
description: "Generate llms.txt for AI-search readiness from a website sitemap"
---

# SEO llms.txt Generator

Generate a llms.txt file for AI-search readiness.

## Usage

\`\`\`
/cc-seo-llms --sitemap <sitemap-url> [--output <path>]
/cc-seo-llms --url <url> [--output <path>]
\`\`\`

## Instructions

1. Parse the user's arguments (--url or --sitemap, --output, --delay)
2. Run the CLI command:
   \`\`\`bash
   codeconductor seo llms --sitemap <sitemap-url> --output <path>
   \`\`\`
   or for single URL:
   \`\`\`bash
   codeconductor seo llms --url <url> --output <path>
   \`\`\`
3. Read the generated llms.txt file
4. Present the result to the user
5. Suggest placing llms.txt at the site root for AI tool discovery

## Hard Rules

- Sitemap-scoped only.
- GET only. No auth headers.
- SSRF prevention enabled.
`;
}
