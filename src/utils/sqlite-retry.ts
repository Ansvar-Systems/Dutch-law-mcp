const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_INITIAL_DELAY_MS = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isDatabaseLockedError(error: unknown): boolean {
  return error instanceof Error && /database is locked/i.test(error.message);
}

export async function withSqliteLockRetry<T>(
  operation: () => T | Promise<T>,
  options: { attempts?: number; initialDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_RETRY_ATTEMPTS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isDatabaseLockedError(error) || attempt >= attempts) {
        throw error;
      }
      await sleep(initialDelayMs * 2 ** (attempt - 1));
    }
  }
}
