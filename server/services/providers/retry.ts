/**
 * Bounded retry for provider rate limits (HTTP 429).
 *
 * Replaces the previous unbounded recursion: a sustained rate limit now fails
 * after a fixed number of attempts with a structured error instead of
 * recursing until the serverless function dies.
 */

export interface RateLimitRetryOptions {
  /** Retries after the initial attempt (default 3). */
  maxRetries?: number;
  /** First backoff delay in ms (default 1000; doubles each retry). */
  baseDelayMs?: number;
  /** Upper bound for any single delay (default 30000). */
  maxDelayMs?: number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export function isRateLimitError(error: any): boolean {
  return error?.status === 429 || error?.response?.status === 429;
}

export class RateLimitExhaustedError extends Error {
  readonly code = "RATE_LIMITED";
  readonly status = 429;

  constructor(providerName: string, attempts: number, readonly cause?: unknown) {
    super(`${providerName} rate limit persisted after ${attempts} retries — giving up`);
    this.name = "RateLimitExhaustedError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  providerName: string,
  options: RateLimitRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (!isRateLimitError(error)) throw error;
      lastError = error;
      if (attempt === maxRetries) break;

      // Honour Retry-After (seconds) when the provider sends it
      const retryAfterSeconds = Number(error?.headers?.["retry-after"]);
      const delayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, maxDelayMs)
          : Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);

      console.warn(`⚠️  ${providerName} rate limited (429). Retry ${attempt + 1}/${maxRetries} in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw new RateLimitExhaustedError(providerName, maxRetries, lastError);
}
