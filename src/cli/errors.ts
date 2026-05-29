/**
 * Exit codes as per CLI contract
 */
export const ExitCode = {
  SUCCESS: 0,
  VALIDATION_ERROR: 1,
  UNSAFE_OPERATION: 2,
  UNSUPPORTED_PROJECT: 3,
  CONFIG_CONFLICT: 4,
} as const;

export type ExitCodeType = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Base error class for CLI errors
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly code: ExitCodeType,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/**
 * Validation error - invalid arguments, malformed config, Zod validation failure
 */
export class ValidationError extends CliError {
  constructor(message: string, details?: unknown) {
    super(message, ExitCode.VALIDATION_ERROR, details);
    this.name = 'ValidationError';
  }
}

/**
 * Unsafe operation - destructive operation without --force, protected path conflict
 */
export class UnsafeOperationError extends CliError {
  constructor(message: string, details?: unknown) {
    super(message, ExitCode.UNSAFE_OPERATION, details);
    this.name = 'UnsafeOperationError';
  }
}

/**
 * Unsupported project - project stack not detected or not supported
 */
export class UnsupportedProjectError extends CliError {
  constructor(message: string, details?: unknown) {
    super(message, ExitCode.UNSUPPORTED_PROJECT, details);
    this.name = 'UnsupportedProjectError';
  }
}

/**
 * Config conflict - existing config conflicts with requested operation
 */
export class ConfigConflictError extends CliError {
  constructor(message: string, details?: unknown) {
    super(message, ExitCode.CONFIG_CONFLICT, details);
    this.name = 'ConfigConflictError';
  }
}

/**
 * Map error to exit code
 */
export function getExitCode(error: unknown): ExitCodeType {
  if (error instanceof CliError) {
    return error.code;
  }
  return ExitCode.VALIDATION_ERROR;
}
