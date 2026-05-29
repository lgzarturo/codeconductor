export type OutputMode = 'human' | 'json';

export interface LogEntry {
  success: boolean;
  command: string;
  data?: unknown;
  message?: string;
  errors?: string[];
}

export class Logger {
  private mode: OutputMode = 'human';

  constructor(mode: OutputMode = 'human') {
    this.mode = mode;
  }

  setMode(mode: OutputMode): void {
    this.mode = mode;
  }

  log(message: string): void {
    if (this.mode === 'json') {
      console.log(JSON.stringify({ message }));
    } else {
      console.log(message);
    }
  }

  success(command: string, data?: unknown): void {
    if (this.mode === 'json') {
      console.log(
        JSON.stringify({
          success: true,
          command,
          data,
        })
      );
    } else {
      if (data && typeof data === 'object') {
        console.log(JSON.stringify(data, null, 2));
      } else if (data) {
        console.log(data);
      }
    }
  }

  error(command: string, errors: string[]): void {
    if (this.mode === 'json') {
      console.log(
        JSON.stringify({
          success: false,
          command,
          errors,
        })
      );
    } else {
      errors.forEach((e) => console.error(e));
    }
  }

  info(message: string): void {
    this.log(message);
  }

  warn(message: string): void {
    if (this.mode === 'json') {
      console.log(JSON.stringify({ warning: message }));
    } else {
      console.warn(message);
    }
  }

  table(data: Record<string, unknown>): void {
    if (this.mode === 'json') {
      console.log(JSON.stringify(data, null, 2));
    } else {
      Object.entries(data).forEach(([key, value]) => {
        console.log(`  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
      });
    }
  }
}

export const logger = new Logger();
