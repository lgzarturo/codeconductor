import type { GoalGraphInput, GoalTaskInput } from '../../validation/schemas';

/**
 * Template definition for goal planning.
 * Each task has an explicit `id` and `depends_on` references those IDs.
 */
interface GoalTemplate {
  readonly keywords: readonly string[];
  readonly tasks: readonly GoalTaskInput[];
}

/**
 * Built-in templates matched by keyword presence in the objective.
 * Task IDs are explicit — depends_on references them directly.
 */
const TEMPLATES: readonly GoalTemplate[] = [
  {
    keywords: ['login', 'auth', 'authentication', 'signin', 'sign-in'],
    tasks: [
      {
        id: 'auth-schema',
        title: 'Define auth data model and DB schema',
        type: 'feature',
        risk: 'high',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: [],
        acceptance_criteria: [
          'User entity with email, password_hash, created_at fields',
          'Migration script creates users table',
          'Schema supports password reset token',
        ],
      },
      {
        id: 'auth-api',
        title: 'Define auth API contract',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['auth-schema'],
        acceptance_criteria: [
          'POST /auth/register endpoint defined',
          'POST /auth/login endpoint defined',
          'POST /auth/logout endpoint defined',
          'OpenAPI spec updated',
        ],
      },
      {
        id: 'auth-impl',
        title: 'Implement auth endpoints',
        type: 'feature',
        risk: 'high',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['auth-api'],
        acceptance_criteria: [
          'Register endpoint hashes password and stores user',
          'Login endpoint validates credentials and returns session',
          'Logout endpoint invalidates session',
          'Input validation on all endpoints',
        ],
      },
      {
        id: 'auth-tests',
        title: 'Write auth tests',
        type: 'test',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['auth-impl'],
        acceptance_criteria: [
          'Unit tests for password hashing',
          'Integration tests for register/login/logout flow',
          'Edge cases: duplicate email, invalid password, expired token',
        ],
      },
    ],
  },
  {
    keywords: ['crud', 'resource', 'api', 'endpoint', 'rest'],
    tasks: [
      {
        id: 'crud-model',
        title: 'Define data model and schema',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: [],
        acceptance_criteria: [
          'Entity definition with required fields',
          'Database migration script',
          'Schema follows project conventions',
        ],
      },
      {
        id: 'crud-service',
        title: 'Implement repository/service layer',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['crud-model'],
        acceptance_criteria: [
          'Create, Read (list + by id), Update, Delete operations',
          'Input validation',
          'Error handling for not-found and conflict',
        ],
      },
      {
        id: 'crud-api',
        title: 'Implement API endpoints',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['crud-service'],
        acceptance_criteria: [
          'REST endpoints for all CRUD operations',
          'Proper HTTP status codes',
          'Request/response schemas',
        ],
      },
      {
        id: 'crud-tests',
        title: 'Write tests',
        type: 'test',
        risk: 'low',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['crud-api'],
        acceptance_criteria: [
          'Unit tests for service layer',
          'Integration tests for API endpoints',
          'Edge cases covered',
        ],
      },
    ],
  },
  {
    keywords: ['search', 'filter', 'query', 'full-text', 'fts'],
    tasks: [
      {
        id: 'search-schema',
        title: 'Design search schema and indexing strategy',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: [],
        acceptance_criteria: [
          'Search index definition',
          'Indexing strategy documented',
          'Performance requirements defined',
        ],
      },
      {
        id: 'search-service',
        title: 'Implement search service',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['search-schema'],
        acceptance_criteria: [
          'Full-text search with ranking',
          'Filter support',
          'Pagination',
        ],
      },
      {
        id: 'search-api',
        title: 'Implement search API',
        type: 'feature',
        risk: 'low',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['search-service'],
        acceptance_criteria: [
          'GET /search endpoint with query params',
          'Response includes results + metadata',
          'Rate limiting applied',
        ],
      },
      {
        id: 'search-tests',
        title: 'Write search tests',
        type: 'test',
        risk: 'low',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['search-api'],
        acceptance_criteria: [
          'Unit tests for search logic',
          'Integration tests with sample data',
          'Performance test for large datasets',
        ],
      },
    ],
  },
  {
    keywords: ['notification', 'email', 'alert', 'push', 'notify'],
    tasks: [
      {
        id: 'notif-model',
        title: 'Design notification data model',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: [],
        acceptance_criteria: [
          'Notification entity with type, payload, status, user_id',
          'Database migration',
          'Enum for notification types',
        ],
      },
      {
        id: 'notif-service',
        title: 'Implement notification service',
        type: 'feature',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['notif-model'],
        acceptance_criteria: [
          'Send notification by type',
          'Queue-based delivery',
          'Retry logic for failed deliveries',
        ],
      },
      {
        id: 'notif-api',
        title: 'Implement notification API',
        type: 'feature',
        risk: 'low',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['notif-service'],
        acceptance_criteria: [
          'POST /notifications endpoint',
          'GET /notifications endpoint with read/unread filter',
          'PATCH /notifications/:id/read endpoint',
        ],
      },
      {
        id: 'notif-tests',
        title: 'Write notification tests',
        type: 'test',
        risk: 'low',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['notif-api'],
        acceptance_criteria: [
          'Unit tests for notification logic',
          'Integration tests for API',
          'Edge cases: invalid type, missing user',
        ],
      },
    ],
  },
  {
    keywords: ['migration', 'migrate', 'schema change', 'database change', 'column'],
    tasks: [
      {
        id: 'migrate-script',
        title: 'Write migration script',
        type: 'feature',
        risk: 'high',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: [],
        acceptance_criteria: [
          'Migration is reversible',
          'Handles existing data gracefully',
          'Rollback script included',
        ],
      },
      {
        id: 'migrate-model',
        title: 'Update domain model',
        type: 'refactor',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['migrate-script'],
        acceptance_criteria: [
          'Domain model reflects new schema',
          'Existing code paths updated',
          'Backward compatibility maintained',
        ],
      },
      {
        id: 'migrate-dal',
        title: 'Update data access layer',
        type: 'refactor',
        risk: 'medium',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['migrate-model'],
        acceptance_criteria: [
          'Repository/service reads/writes new schema',
          'No broken queries',
          'Performance not degraded',
        ],
      },
      {
        id: 'migrate-tests',
        title: 'Write migration tests',
        type: 'test',
        risk: 'high',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: ['migrate-dal'],
        acceptance_criteria: [
          'Migration up/down test',
          'Data integrity test',
          'Integration tests with new schema',
        ],
      },
    ],
  },
];

/**
 * Generic fallback template when no keyword match is found
 */
const GENERIC_TEMPLATE: readonly GoalTaskInput[] = [
  {
    id: 'plan-scope',
    title: 'Clarify requirements and scope',
    type: 'feature',
        risk: 'low',
        status: 'pending',
        context_scope: 'isolated',
        depends_on: [],
    acceptance_criteria: ['Objective is well-defined', 'Scope boundaries identified'],
  },
  {
    id: 'plan-design',
    title: 'Design technical approach',
    type: 'feature',
    risk: 'medium',
    status: 'pending',
    context_scope: 'isolated',
    depends_on: ['plan-scope'],
    acceptance_criteria: ['Architecture decisions documented', 'API contracts defined'],
  },
  {
    id: 'plan-impl',
    title: 'Implement solution',
    type: 'feature',
    risk: 'medium',
    status: 'pending',
    context_scope: 'isolated',
    depends_on: ['plan-design'],
    acceptance_criteria: ['Core functionality implemented', 'Follows project conventions'],
  },
  {
    id: 'plan-tests',
    title: 'Write tests and verify',
    type: 'test',
    risk: 'low',
    status: 'pending',
    context_scope: 'isolated',
    depends_on: ['plan-impl'],
    acceptance_criteria: ['Unit tests pass', 'Integration tests pass', 'No regressions'],
  },
];

/**
 * Match objective against templates and select the best one
 */
function matchTemplate(objective: string): readonly GoalTaskInput[] {
  const lower = objective.toLowerCase();

  for (const template of TEMPLATES) {
    const matched = template.keywords.some((kw) => lower.includes(kw));
    if (matched) return template.tasks;
  }

  return GENERIC_TEMPLATE;
}

/**
 * Pure function: objective string → GoalGraph
 *
 * Matches the objective against built-in templates (auth, crud, search,
 * notification, migration) or falls back to a generic 4-task chain.
 */
export function planGoal(objective: string): GoalGraphInput {
  const tasks = matchTemplate(objective);

  return {
    objective,
    tasks: tasks.map((t) => ({ ...t, status: 'pending' as const })),
    created_at: new Date().toISOString(),
  };
}
