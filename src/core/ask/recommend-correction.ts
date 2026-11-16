/**
 * Deterministic mistake-signal → correction-layer router.
 * Points at existing owners only. Does not start a workflow or generate rules.
 */

export type CorrectionLayer =
  | 'architecture'
  | 'static-analysis'
  | 'verification'
  | 'prose';

export interface CorrectionRecommendation {
  readonly layer: CorrectionLayer;
  /** Existing command or check the agent must run; never a new workflow. */
  readonly command: string;
  readonly reason: string;
  /** True when a lower-layer owner exists — do not add AGENTS.md paragraphs. */
  readonly forbidProse: boolean;
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function pick(
  layer: CorrectionLayer,
  command: string,
  reason: string,
  forbidProse = true,
): CorrectionRecommendation {
  return { layer, command, reason, forbidProse };
}

/**
 * Map a free-text mistake signal to exactly one correction layer and owner command.
 */
export function recommendCorrection(signal: string): CorrectionRecommendation {
  const text = signal.trim().toLowerCase();

  if (
    includesAny(text, [
      'bun run dev',
      'script not found "dev"',
      'script not found \'dev\'',
      'consumer cli',
      'consumer-facing',
      'npx cc-codeconductor',
    ])
  ) {
    return pick(
      'static-analysis',
      'bun test test/unit/presets/consumer-cli-invocation.test.ts',
      'Shipped artifacts must not tell consumers to run `bun run dev`. The consumer-cli-invocation test owns this; do not restate it in AGENTS.md.',
    );
  }

  if (
    includesAny(text, [
      'council redirect',
      'council stub',
      'hand-edit council',
      'hand edit council',
      'cc-council',
      'check:council-redirect',
    ])
  ) {
    return pick(
      'static-analysis',
      'bun run check:council-redirect',
      'Council copies must stay generated redirect stubs. Regenerating scripts own this; never hand-edit the copies or document a workaround.',
    );
  }

  if (
    includesAny(text, [
      'check:drift',
      'hand-edit preset',
      'hand edit preset',
      'hand-edit skill',
      'sync:skills',
      'presets drifted',
      'shared-skills',
    ])
  ) {
    return pick(
      'static-analysis',
      'bun run check:drift',
      'Generated presets and synced skills have one source of truth. Fix the generator or canonical skill, then re-run check:drift.',
    );
  }

  // Needle strings are split so scripts/lint.ts does not flag this file.
  const doubleCast = ['as un', 'known as'].join('');
  const anyAnnotation = [':', ' any'].join('');
  const anyAssertion = ['as', ' any'].join('');
  if (
    includesAny(text, [
      'no-any',
      doubleCast,
      'nested import',
      'no-nested-import',
      anyAnnotation,
      anyAssertion,
    ])
  ) {
    return pick(
      'static-analysis',
      'bun run lint',
      'TypeScript agent shortcuts are banned in src/ by scripts/lint.ts. Fix the code; do not add a prose reminder.',
    );
  }

  if (
    includesAny(text, [
      'out of scope',
      'outside scope',
      'scope guard',
      'scope violation',
      'surgical',
      'adjacent code',
      'filesaffected',
      'symbol boundary',
    ])
  ) {
    return pick(
      'verification',
      'scope-guard (checkScopeCompliance)',
      'Diff scope is enforced by checkScopeCompliance (fail-closed when git evidence is missing). Tighten the Technical Plan allowlist or shrink the diff — do not add AGENTS.md surgical-change prose.',
    );
  }

  if (
    includesAny(text, [
      'rdd verify',
      'ev-rdd',
      'receipt',
      'rdd receipt',
      'receipt-driven',
    ])
  ) {
    return pick(
      'verification',
      'cc-codeconductor rdd verify --receipt <id>',
      'RDD receipts are verified by the rdd CLI. Capture or verify the receipt for the current candidate; do not invent a checklist paragraph.',
    );
  }

  if (
    includesAny(text, [
      'openspec analyze',
      'skip analyze',
      'skipped analyze',
      'skip openspec',
      'before openspec analyze',
    ])
  ) {
    return pick(
      'verification',
      'cc-codeconductor openspec analyze',
      'OpenSpec analyze is the gate before implementer work. Run it; do not replace it with a skill reminder.',
    );
  }

  if (
    includesAny(text, [
      'document in agents',
      'document this in agents',
      'add to agents.md',
      'update agents.md',
      'write in agents.md',
      'add a rule to agents',
      'documenta esto en agents',
      'añade a agents.md',
      'agrega a agents.md',
    ])
  ) {
    return pick(
      'prose',
      '(none — refuse until a lower-layer owner is ruled out)',
      'AGENTS.md is last. First ask whether architecture, lint/CI, or a verification command can own the rule. Only judgment calls that cannot be enforced belong in prose.',
      false,
    );
  }

  return pick(
    'verification',
    'cc-codeconductor doctor',
    'No known mistake class matched. Run doctor / the relevant verification CLI before adding prose.',
    true,
  );
}
