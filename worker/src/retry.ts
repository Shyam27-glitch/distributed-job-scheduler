export interface RetryPolicyConfig {
  strategy: 'fixed' | 'linear' | 'exponential';
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  maxRetries: number;
}

/** attemptNumber is the retry_count after incrementing (1 = first retry, 2 = second, ...). */
export function computeRetryDelayMs(policy: RetryPolicyConfig, attemptNumber: number): number {
  let delay: number;
  switch (policy.strategy) {
    case 'fixed':
      delay = policy.baseDelayMs;
      break;
    case 'linear':
      delay = policy.baseDelayMs * attemptNumber;
      break;
    case 'exponential':
      delay = policy.baseDelayMs * Math.pow(policy.multiplier, attemptNumber - 1);
      break;
  }
  return Math.min(delay, policy.maxDelayMs);
}
