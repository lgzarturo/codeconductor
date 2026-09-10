import type { CouncilAgentSpec } from './council-spec';

export interface CouncilAgentConfig {
  readonly agent: CouncilAgentSpec;
  readonly content: string;
}

/** JSON-stringify a value for a YAML scalar — quotes and escapes it safely. Shared by every council generator that emits YAML frontmatter. */
export function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * The permission block for a council agent's frontmatter, keyed only by
 * whether it can read the repo. Shared by agy and opencode — the two
 * targets whose council agents carry a permission block in this exact shape.
 */
export function generatePermissionBlock(context: CouncilAgentSpec['context']): string {
  if (context === 'repo-readonly') {
    return `  read: allow
  edit: deny
  bash: deny
  glob: allow
  grep: allow
  webfetch: deny
  websearch: deny`;
  }

  return `  read: deny
  edit: deny
  bash: deny
  glob: deny
  grep: deny
  webfetch: deny
  websearch: deny`;
}

interface RoleProfile {
  readonly responsibilities: readonly string[];
  readonly checklist: readonly string[];
  readonly vetoNote?: string;
}

/**
 * Per-role review checklists. Sourced from the real v1.0.0 agent contracts
 * (presets/opencode/prompts/v1.0.0/{architect,devil,security-reviewer}.md)
 * for the roles that have one, condensed to fit a council member's shorter
 * format. product/delivery/data-ops have no v1.0.0 equivalent, so their
 * checklist follows the same axis-table pattern the rest of the repo already
 * uses (see the Reviewer role's "Review axes" table) applied to their domain.
 */
const ROLE_PROFILES: Record<string, RoleProfile> = {
  architect: {
    responsibilities: [
      'Analyze code architecture',
      'Suggest design patterns',
      'Review code structure',
      'Propose refactoring',
    ],
    checklist: [
      'Does the diff follow existing module boundaries and naming conventions?',
      'Are there speculative abstractions not required by the current task?',
      'Does it introduce hidden coupling between previously independent modules?',
      'Is the chosen approach the simplest one that satisfies the requirement?',
    ],
  },
  'security-reviewer': {
    responsibilities: [
      'Identify security vulnerabilities',
      'Review for OWASP Top 10 risks',
      'Check compliance requirements',
      'Flag credential, injection, auth, and supply-chain issues',
    ],
    checklist: [
      'Injection vectors: SQL, command, template, LDAP?',
      'Auth: bypass, session fixation, privilege escalation?',
      'Credentials: hardcoded secrets, tokens in logs, insecure storage?',
      'Supply chain: untrusted or unpinned dependencies?',
      'Data exposure: PII in logs, internals leaking through error messages?',
    ],
    vetoNote:
      'Any CRITICAL finding here sets `securityVeto: true` — it overrides majority consensus.',
  },
  product: {
    responsibilities: [
      'Understand requirements',
      'Evaluate UX decisions',
      'Assess business value',
      'Prioritize features',
    ],
    checklist: [
      'Does the change satisfy the stated requirement and acceptance criteria?',
      'Is there a user-facing regression or an unclear interaction?',
      'Is the scope proportional to the business value, not gold-plated?',
    ],
  },
  delivery: {
    responsibilities: [
      'Review test coverage',
      'Assess deployment readiness',
      'Evaluate code quality',
      'Suggest improvements',
    ],
    checklist: [
      'Is test coverage adequate for happy path, edge cases, and error cases?',
      'Can this ship without a manual follow-up step?',
      'Is there a rollback path or observability for this change?',
    ],
  },
  'data-ops': {
    responsibilities: [
      'Review data pipelines',
      'Assess analytics implementation',
      'Check data quality',
      'Suggest improvements',
    ],
    checklist: [
      'Does the change affect schemas, migrations, or pipelines safely?',
      'Is any analytics or tracking impact documented?',
      'Is backward compatibility preserved for existing data consumers?',
    ],
  },
  devil: {
    responsibilities: [
      'Challenge assumptions',
      'Find edge cases',
      'Identify failure modes',
      'Stress test solutions',
    ],
    checklist: [
      'Assumption: what is being assumed that has not been verified?',
      'Failure mode: how does this break under load, edge cases, or partial failure?',
      'Scope: what is being pulled in that the objective does not require?',
      'Simpler path: was a materially simpler approach dismissed too fast?',
      'Reversibility: if this is wrong, how expensive is it to undo?',
    ],
  },
  'seo-auditor': {
    responsibilities: [
      'Audit technical SEO',
      'Check meta tags and headings',
      'Validate crawl directives',
      'Assess page speed signals',
    ],
    checklist: [
      'Are meta tags, headings, and crawl directives correct?',
      'Does the page speed profile regress Core Web Vitals?',
    ],
  },
  'schema-validator': {
    responsibilities: [
      'Validate Schema.org markup',
      'Check JSON-LD syntax',
      'Verify required properties',
      'Suggest structured data fixes',
    ],
    checklist: [
      'Is the JSON-LD syntactically valid and schema.org-compliant?',
      'Are all required properties for the markup type present?',
    ],
  },
  'geo-specialist': {
    responsibilities: [
      'Assess AI-search readiness',
      'Validate llms.txt',
      'Check citable content',
      'Review GEO optimization',
    ],
    checklist: [
      'Is content structured for passage-level citability?',
      'Does llms.txt accurately describe crawl permissions?',
    ],
  },
  'content-strategist': {
    responsibilities: [
      'Plan content marketing',
      'Guide off-page SEO',
      'Suggest backlink strategy',
      'Review hotel copywriting',
    ],
    checklist: [
      'Does the content plan align with the target audience and intent?',
      'Is the backlink strategy realistic and policy-compliant?',
    ],
  },
  'astro-specialist': {
    responsibilities: [
      'Validate Astro SEO patterns',
      'Check static generation',
      'Review Islands Architecture',
      'Optimize image handling',
    ],
    checklist: [
      'Are pages statically generated where possible?',
      'Is client-side hydration limited to interactive islands?',
    ],
  },
};

const DEFAULT_PROFILE: RoleProfile = {
  responsibilities: ['Provide critical review'],
  checklist: ['Does the change satisfy this role’s stated focus areas?'],
};

function profileFor(agentId: string): RoleProfile {
  return ROLE_PROFILES[agentId] ?? DEFAULT_PROFILE;
}

/** Review checklist for an agent id, for generators that render a condensed (e.g. single-line TOML) format instead of the full Markdown contract. */
export function checklistFor(agentId: string): readonly string[] {
  return profileFor(agentId).checklist;
}

export function generateAgentContent(agent: CouncilAgentSpec): string {
  const profile = profileFor(agent.id);
  const vetoSection = profile.vetoNote ? `\n## Veto\n${profile.vetoNote}\n` : '';

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
${profile.responsibilities.map((r) => `- ${r}`).join('\n')}

## Review Checklist
${profile.checklist.map((c) => `- ${c}`).join('\n')}
${vetoSection}
## Finding Format
- **CRITICAL** — blocks the council verdict; must be resolved before merge.
- **WARNING** — should be resolved before merge; does not block.
- **SUGGESTION** — optional improvement, non-blocking.
`;
}
