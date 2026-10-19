/** Seeded defect for review-seeded-bug task: off-by-one in clamp. */
export function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  // BUG: should be `n > max`, not `n >= max` with return max-1
  if (n >= max) return max - 1;
  return n;
}
