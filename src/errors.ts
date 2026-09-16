export const EXIT_OK = 0;
export const EXIT_OPERATIONAL = 1;
export const EXIT_USAGE = 2;

export class BrewhyError extends Error {
  readonly exitCode: number;
  readonly hint: string | undefined;

  constructor(message: string, exitCode: number, hint?: string) {
    super(message);
    this.name = "BrewhyError";
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export function usageError(message: string, hint?: string): BrewhyError {
  return new BrewhyError(message, EXIT_USAGE, hint);
}

export function operationalError(message: string, hint?: string): BrewhyError {
  return new BrewhyError(message, EXIT_OPERATIONAL, hint);
}
