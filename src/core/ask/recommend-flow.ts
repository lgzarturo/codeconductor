/**
 * Deterministic NL → slash-command router for `/cc:ask`.
 * Does not start the recommended workflow.
 */

export interface AskFlow {
  readonly command: string;
  readonly slash: string;
  readonly blurb: string;
}

export const ASK_FLOW_CATALOG: readonly AskFlow[] = [
  {
    command: 'feature',
    slash: '/cc:feature',
    blurb: 'new behavior or capability that does not exist yet',
  },
  {
    command: 'fix',
    slash: '/cc:fix',
    blurb: 'something that used to work (or should work) is broken',
  },
  {
    command: 'refactor',
    slash: '/cc:refactor',
    blurb: 'restructure existing code without changing observable behavior',
  },
  {
    command: 'review',
    slash: '/cc:review',
    blurb: 'inspect a diff or PR; do not implement',
  },
  {
    command: 'tdd-cycle',
    slash: '/cc:tdd-cycle',
    blurb: 'one red-green-refactor cycle starting from a failing test',
  },
  {
    command: 'openspec',
    slash: '/cc:openspec',
    blurb: 'deliver a BACKLOG.md / OpenSpec tracer bullet',
  },
];

export interface AskRecommendation {
  readonly command: string;
  readonly slash: string;
  readonly reason: string;
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Map a free-text problem to exactly one catalog slash command.
 */
export function recommendAskFlow(problem: string): AskRecommendation {
  const text = problem.trim().toLowerCase();
  const catalog = new Map(ASK_FLOW_CATALOG.map((f) => [f.command, f]));

  const pick = (command: string, reason: string): AskRecommendation => {
    const flow = catalog.get(command)!;
    return { command: flow.command, slash: flow.slash, reason };
  };

  if (includesAny(text, ['openspec', 'backlog', 'tracer bullet', 'bc-'])) {
    return pick(
      'openspec',
      'The request names OpenSpec, BACKLOG, or a BC-xxx item, so /cc:openspec is the delivery loop.',
    );
  }

  if (
    includesAny(text, [
      'tdd',
      'red-green',
      'red before green',
      'failing test first',
      'write a failing test',
    ])
  ) {
    return pick(
      'tdd-cycle',
      'The request asks for a failing test before implementation, which is the /cc:tdd-cycle contract.',
    );
  }

  if (
    includesAny(text, [
      'pull request',
      'code review',
      'review this',
      'review the pr',
      'review this pr',
    ])
  ) {
    return pick(
      'review',
      'The request is to inspect a change, not to implement, so /cc:review is the fit.',
    );
  }

  if (
    includesAny(text, [
      'refactor',
      'extract ',
      'duplicated',
      'no behavior change',
      'cleanup',
    ])
  ) {
    return pick(
      'refactor',
      'The request is to restructure existing code without new behavior, so /cc:refactor applies.',
    );
  }

  if (
    includesAny(text, [
      'bug',
      'broken',
      'crash',
      'fails',
      'failing',
      'error',
      'regression',
      '500',
    ])
  ) {
    return pick(
      'fix',
      'The request describes a failure or regression, so /cc:fix is the repair workflow.',
    );
  }

  return pick(
    'feature',
    'No bug, refactor, review, TDD, or backlog signal — treating this as new work for /cc:feature.',
  );
}
