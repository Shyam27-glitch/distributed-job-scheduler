function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Demo handler covering the "trivial handler" needed to run jobs end-to-end.
 * payload.sleepMs simulates work; payload.shouldFail exercises the failure path.
 */
export async function runJob(payload: Record<string, unknown>): Promise<void> {
  const sleepMs = typeof payload.sleepMs === 'number' ? payload.sleepMs : 0;
  if (sleepMs > 0) await sleep(sleepMs);

  if (payload.shouldFail) {
    const message = typeof payload.failureMessage === 'string' ? payload.failureMessage : 'job failed intentionally';
    throw new Error(message);
  }
}
