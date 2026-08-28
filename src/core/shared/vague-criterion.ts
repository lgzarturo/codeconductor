const VAGUE_PATTERNS = [
  /^mejorar\s/i,
  /^fix\s+bugs?$/i,
  /^refactor$/i,
  /^hacer\s+refactor/i,
  /^arreglar\s+bugs?/i,
  /^improve\s+ux$/i,
  /^better\s+ux$/i,
  /^cleanup$/i,
  /^misc$/i,
];

export function isVagueCriterion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return true;
  return VAGUE_PATTERNS.some((p) => p.test(t));
}
