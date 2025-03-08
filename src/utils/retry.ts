export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

export interface RetryState {
  attempt: number;
  lastProcessedRepo?: string;
  error?: Error;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (state: RetryState) => void,
): Promise<T> {
  let lastError: Error | undefined;
  let currentDelay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === config.maxAttempts) {
        break;
      }

      if (onRetry) {
        onRetry({ attempt, error: lastError });
      }

      await sleep(currentDelay);
      currentDelay = Math.min(
        currentDelay * config.backoffFactor,
        config.maxDelayMs,
      );
    }
  }

  throw new Error(
    `Operation failed after ${config.maxAttempts} attempts: ${lastError?.message}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
