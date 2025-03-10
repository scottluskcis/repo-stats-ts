export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  successThreshold?: number; // Number of successful runs needed to reset retry count
}

export interface RetryState {
  attempt: number;
  successCount: number;
  retryCount: number;
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
  let successCount = 0;
  let retryCount = 0;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();

      successCount++;
      if (successCount >= (config.successThreshold || 5)) {
        successCount = 0;
        retryCount = 0;
      }

      return result;
    } catch (error) {
      successCount = 0;
      retryCount++;

      lastError =
        error instanceof Error
          ? error
          : new Error(
              typeof error === 'object' ? JSON.stringify(error) : String(error),
            );

      if (attempt === config.maxAttempts) {
        break;
      }

      if (onRetry) {
        onRetry({
          attempt,
          error: lastError,
          successCount,
          retryCount,
        });
      }

      await sleep(currentDelay);
      currentDelay = Math.min(
        currentDelay * config.backoffFactor,
        config.maxDelayMs,
      );
    }
  }

  throw new Error(
    `Operation failed after ${config.maxAttempts} attempts: ${
      lastError?.message || 'No error message available'
    }${lastError?.stack ? `\nStack trace: ${lastError.stack}` : ''}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
