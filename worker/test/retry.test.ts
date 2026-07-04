import { computeRetryDelayMs, type RetryPolicyConfig } from '../src/retry';

const base: Omit<RetryPolicyConfig, 'strategy'> = {
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
  multiplier: 2,
  maxRetries: 5,
};

describe('computeRetryDelayMs', () => {
  it('fixed strategy returns the same delay every attempt', () => {
    const policy: RetryPolicyConfig = { ...base, strategy: 'fixed' };
    expect(computeRetryDelayMs(policy, 1)).toBe(1000);
    expect(computeRetryDelayMs(policy, 5)).toBe(1000);
  });

  it('linear strategy scales delay by attempt number', () => {
    const policy: RetryPolicyConfig = { ...base, strategy: 'linear' };
    expect(computeRetryDelayMs(policy, 1)).toBe(1000);
    expect(computeRetryDelayMs(policy, 3)).toBe(3000);
  });

  it('exponential strategy grows by multiplier^(attempt-1)', () => {
    const policy: RetryPolicyConfig = { ...base, strategy: 'exponential' };
    expect(computeRetryDelayMs(policy, 1)).toBe(1000);
    expect(computeRetryDelayMs(policy, 2)).toBe(2000);
    expect(computeRetryDelayMs(policy, 3)).toBe(4000);
  });

  it('caps the delay at maxDelayMs', () => {
    const policy: RetryPolicyConfig = { ...base, strategy: 'exponential' };
    expect(computeRetryDelayMs(policy, 10)).toBe(10_000);
  });
});
