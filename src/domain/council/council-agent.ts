import type { CouncilAgentSpec } from './council-spec';

export interface CouncilAgentConfig {
  readonly agent: CouncilAgentSpec;
  readonly content: string;
}

function getResponsibilities(agentId: string): string {
  const responsibilities: Record<string, string> = {
    architect: `- Analyze code architecture
- Suggest design patterns
- Review code structure
- Propose refactoring`,
    security: `- Identify security vulnerabilities
- Review for OWASP risks
- Check compliance requirements
- Suggest security improvements`,
    product: `- Understand requirements
- Evaluate UX decisions
- Assess business value
- Prioritize features`,
    delivery: `- Review test coverage
- Assess deployment readiness
- Evaluate code quality
- Suggest improvements`,
    'data-ops': `- Review data pipelines
- Assess analytics implementation
- Check data quality
- Suggest improvements`,
    devil: `- Challenge assumptions
- Find edge cases
- Identify failure modes
- Stress test solutions`,
    'seo-auditor': `- Audit technical SEO
- Check meta tags and headings
- Validate crawl directives
- Assess page speed signals`,
    'schema-validator': `- Validate Schema.org markup
- Check JSON-LD syntax
- Verify required properties
- Suggest structured data fixes`,
    'geo-specialist': `- Assess AI-search readiness
- Validate llms.txt
- Check citable content
- Review GEO optimization`,
    'content-strategist': `- Plan content marketing
- Guide off-page SEO
- Suggest backlink strategy
- Review hotel copywriting`,
    'astro-specialist': `- Validate Astro SEO patterns
- Check static generation
- Review Islands Architecture
- Optimize image handling`,
  };
  return responsibilities[agentId] || '- Provide critical review';
}

export function generateAgentContent(agent: CouncilAgentSpec): string {
  return `# ${agent.role} Agent

## Role
${agent.role}

## Context
${agent.context === 'repo-readonly' ? 'Can read repository but cannot modify files' : 'Only receives prompts, no direct repository access'}

## Model Hint
${agent.modelHint}

## Focus Areas
${agent.focus.map((f) => `- ${f}`).join('\n')}

## Responsibilities
${getResponsibilities(agent.id)}
`;
}
