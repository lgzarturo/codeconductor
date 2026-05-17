/**
 * Runtime assertion - throws if condition is false
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant failed: ${message}`)
  }
}

/**
 * Assert that a value is not null/undefined
 */
export function assertDefined<T>(value: T, message = 'Value is undefined'): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
}